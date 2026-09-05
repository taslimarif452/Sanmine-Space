import { getTool } from "@/lib/agent/tools";
import type { AgentEvent, ToolResult } from "@/lib/agent/tools/types";

export const MAX_AGENT_STEPS = 8;
export const MAX_TOOL_CALLS = 10;
export const TOOL_TIMEOUT_MS = 60_000;
export const MODEL_TIMEOUT_MS = 60_000;
export const MAX_RETRIES = 1;

export type SafeSource = { title: string; url: string; snippet?: string; domain: string };

export function withTimeout<T>(promise: Promise<T>, _ms: number, _label: string): Promise<T> {
  return promise;
}

export async function executeWithRetry<T>(fn: () => Promise<T>, _label: string, _timeout = TOOL_TIMEOUT_MS): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try { return await fn(); }
    catch (error) { last = error; if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 250 * 2 ** attempt)); }
  }
  throw last instanceof Error ? last : new Error("Agent execution failed.");
}

export function normalizeToolResult(name: string, toolCallId: string, value: unknown): ToolResult {
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;

    // Preserve structured YouTube records. The agent needs creator_name,
    // contact_email, subscribers, website evidence, etc. to satisfy filters
    // and produce a complete list. The old generic search normalizer discarded
    // all of those fields and left only title/url/snippet.
    if (name === "youtube_search") {
      const normalized: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(source)) {
        if (["raw", "svgSources", "functionCall", "functionResponse", "tool_result", "debug", "trace"].includes(key)) continue;
        if (key !== "results") normalized[key] = item;
      }
      if (Array.isArray(source.results)) {
        normalized.results = source.results.slice(0, 20).map((item) => {
          if (!item || typeof item !== "object") return item;
          const row = item as Record<string, unknown>;
          const out: Record<string, unknown> = {};
          for (const [key, itemValue] of Object.entries(row)) {
            if (/^(raw|svgSources|functionCall|functionResponse|tool_result|debug|trace)$/i.test(key)) continue;
            if (/^(url|channel_url)$/i.test(key) && itemValue !== undefined && !normalizeUrl(String(itemValue))) continue;
            out[key] = typeof itemValue === "string" ? itemValue.slice(0, 12000) : itemValue;
          }
          return out;
        });
      }
      return { toolCallId, name, result: normalized };
    }

    const results = Array.isArray(source.results)
      ? source.results.map((item) => normalizeSearchItem(item)).filter(Boolean).slice(0, 20)
      : undefined;
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      if (["raw", "svgSources", "functionCall", "functionResponse", "tool_result", "debug", "trace"].includes(key)) continue;
      if (key === "results") continue;
      normalized[key] = item;
    }
    if (results) normalized.results = results;
    return { toolCallId, name, result: normalized };
  }
  return { toolCallId, name, result: { status: "success", value: typeof value === "string" ? value.slice(0, 20_000) : value } };
}

function normalizeSearchItem(item: unknown): Record<string, string> | null {
  if (!item || typeof item !== "object") return null;
  const x = item as Record<string, unknown>;
  const url = typeof x.url === "string" ? normalizeUrl(x.url) : null;
  if (!url) return null;
  return {
    title: String(x.title || x.name || "Web source").slice(0, 300),
    url,
    ...(x.snippet ? { snippet: String(x.snippet).replace(/\s+/g, " ").slice(0, 500) } : {}),
  };
}

export function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch { return null; }
}

export function collectValidatedSources(events: AgentEvent[]): SafeSource[] {
  const map = new Map<string, SafeSource>();
  for (const event of events) {
    if (event.type !== "tool_result" || !event.result || typeof event.result !== "object") continue;
    const result = event.result as Record<string, unknown>;
    const add = (item: unknown) => {
      if (!item || typeof item !== "object") return;
      const x = item as Record<string, unknown>;
      const url = typeof x.url === "string" ? normalizeUrl(x.url) : null;
      if (!url) return;
      const domain = new URL(url).hostname.replace(/^www\./, "");
      map.set(url, { title: String(x.title || "Web source").slice(0, 180), url, domain, ...(x.snippet ? { snippet: String(x.snippet).replace(/\s+/g, " ").slice(0, 240) } : {}) });
    };
    if (Array.isArray(result.results)) result.results.forEach(add);
    add(result);
  }
  return [...map.values()].slice(0, 12);
}

export function isUnsafeAssistantOutput(text: string): boolean {
  const value = text.trim();
  if (!value) return true;
  if (/^i[’']m ready\.\s*what would you like me to do\??$/i.test(value)) return true;
  if (/\b(svgSources|functionCall|functionResponse|tool_result|tool_calls)\b/i.test(value)) return true;
  if (/^\s*\{[\s\S]*\}\s*$/.test(value) && /"(?:tool|results|function)"\s*:/.test(value)) return true;
  return false;
}

export function isToolTestRequest(text: string): boolean {
  return /(?:test|check|verify|try|run|use)\s+(?:all|every|each|the)?\s*(?:available\s*)?(?:tools|tool)|(?:tools|toolkit).*(?:test|check|verify)|sab(?:hi|hi)?\s*(?:tools|tool).*test/i.test(text);
}

export async function runSafeToolTest(onEvent?: (event: AgentEvent) => void) {
  const candidates = ["search_web", "open_page", "website_analyze", "youtube_search"];
  const report: Array<{ tool: string; status: string; message: string }> = [];
  for (const name of candidates) {
    const tool = getTool(name);
    if (!tool) { report.push({ tool: name, status: "unavailable", message: "Tool is not registered." }); continue; }
    const id = `selftest-${name}-${Date.now()}`;
    onEvent?.({ type: "tool_start", name, toolCallId: id });
    try {
      const args = name === "search_web" ? { query: "Sanmine Space", limit: 1 } : name === "open_page" ? { url: "https://example.com" } : name === "website_analyze" ? { url: "https://example.com" } : { query: "OpenAI", limit: 1, type: "video" };
      const result = await executeWithRetry(() => tool.execute(args), name);
      const safe = normalizeToolResult(name, id, result).result;
      onEvent?.({ type: "tool_result", name, toolCallId: id, result: safe });
      const status = safe && typeof safe === "object" && (safe as Record<string, unknown>).status === "error" ? "failed" : "passed";
      report.push({ tool: name, status, message: status === "passed" ? "Tool executed successfully." : String((safe as Record<string, unknown>).message || "Tool returned an error.") });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed.";
      onEvent?.({ type: "tool_result", name, toolCallId: id, result: { status: "error", message } });
      report.push({ tool: name, status: "failed", message });
    }
  }
  return report;
}
