import type { AgentTool, ToolDefinition } from "@/lib/agent/tools/types";
import { searchWebTool } from "@/lib/agent/tools/search-web";
import { openPageTool } from "@/lib/agent/tools/open-page";
import { websiteAnalyzeTool } from "@/lib/agent/tools/website-analyze";
import { generateProposalTool } from "@/lib/agent/tools/generate-proposal";
import { generateEmailTool } from "@/lib/agent/tools/generate-email";
import { sendTestEmailTool } from "@/lib/agent/tools/send-test-email";
import { sendEmailTool } from "@/lib/agent/tools/send-email";
import { youtubeSearchTool } from "@/lib/agent/tools/youtube-search";
import { researchLeadsTool } from "@/lib/agent/tools/research-leads";

const rawTools: AgentTool[] = [
  searchWebTool,
  openPageTool,
  websiteAnalyzeTool,
  youtubeSearchTool,
  researchLeadsTool,
  generateProposalTool,
  generateEmailTool,
  sendEmailTool,
  sendTestEmailTool,
];

const SAFE_TEST_INPUTS: Record<string, Record<string, unknown>> = {
  search_web: { query: "Sanmine Space official website", limit: 1 },
  youtube_search: { query: "Sanmine Space", limit: 1, type: "video" },
  open_page: { url: "https://example.com", max_chars: 1500 },
  website_analyze: { url: "https://example.com" },
  research_leads: { query: "software companies", location: "India", limit: 1 },
  generate_proposal: { company_name: "Test Company", service: "website development", research: "Test-only validation; do not invent facts." },
  generate_outreach_email: { company_name: "Test Company", recipient_name: "Test Contact", service: "website development", research: "Test-only validation; do not invent facts." },
};

function validateSourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (typeof value === "string") return value.slice(0, 12000);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (/^(raw|raw_html|html|svgSources|functionCall|functionResponse|tool_result)$/i.test(key)) continue;
    if (/^(url|source_url|channel_url|link)$/i.test(key) && item !== undefined && !validateSourceUrl(item)) continue;
    out[key] = sanitizeValue(item, depth + 1);
  }
  return out;
}

function parseMinimumCount(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.toLowerCase();
  const patterns = [
    /\b(?:minimum|min|at\s+least|no\s+less\s+than|not\s+less\s+than)\s+(?:of\s+)?(\d+)\b/i,
    /\b(?:kam\s+se\s+kam|कम\s+से\s+कम)\s*(\d+)\b/i,
    /\b(\d+)\s*(?:se\s+kam\s+n(?:a|ahi|ahin)|se\s+kam\s+nahi|or\s+more|ya\s+(?:zyada|adhik))\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const count = match ? Number(match[1]) : 0;
    if (Number.isInteger(count) && count > 0 && count <= 1000) return count;
  }
  return undefined;
}

function prepareToolArgs(tool: AgentTool, args: Record<string, unknown>): Record<string, unknown> {
  const minimum = Object.values(args).map(parseMinimumCount).find((value): value is number => value !== undefined);
  if (!minimum) return args;
  const prepared = { ...args, minimum_required: minimum };
  if (typeof prepared.limit === "number") prepared.limit = Math.max(prepared.limit, minimum);
  else if (tool.name === "search_web" || tool.name === "youtube_search" || tool.name === "research_leads") prepared.limit = minimum;
  return prepared;
}

function normalizeToolResult(name: string, result: unknown): Record<string, unknown> {
  if (result instanceof Error) return { status: "error", tool: name, message: result.message.slice(0, 500) };
  const clean = sanitizeValue(result) as Record<string, unknown>;
  if (!clean || typeof clean !== "object" || Array.isArray(clean)) return { status: "success", tool: name, data: clean };
  const results = Array.isArray(clean.results) ? clean.results : undefined;
  if (results) {
    clean.results = results.map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = item as Record<string, unknown>;
      return { ...row, ...(validateSourceUrl(row.url) ? { url: row.url } : { url: undefined }) };
    });
  }
  return { ...clean, tool: name };
}

async function executeWithBudget(tool: AgentTool, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const timeoutMs = tool.name === "youtube_search" ? 120_000 : tool.name === "search_web" ? 30_000 : tool.name === "open_page" ? 20_000 : 30_000;
  const attempts = tool.name === "send_proposal_outreach" || tool.name === "send_test_email" ? 1 : 2;
  const preparedArgs = prepareToolArgs(tool, args);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await Promise.race([
        tool.execute(preparedArgs),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${tool.name} timed out after ${Math.ceil(timeoutMs / 1000)}s.`)), timeoutMs)),
      ]);
      return normalizeToolResult(tool.name, result);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  return normalizeToolResult(tool.name, {
    status: "error",
    message: lastError instanceof Error ? lastError.message : `${tool.name} failed after ${attempts} attempts.`,
    retryable: false,
  });
}

const tools: AgentTool[] = rawTools.map((tool) => ({ ...tool, execute: (args) => executeWithBudget(tool, args) }));

const toolTestTool: AgentTool = {
  name: "agent_tool_test",
  description: "Run a real, safe health check of the available Sanmine AI tools. IMPORTANT: when the user asks to test/check all available tools, call this tool. It executes read-only/search/generation tools with harmless test inputs, never sends emails, never contacts prospects, and returns pass/fail/configuration results.",
  parameters: { type: "object", properties: {}, required: [] },
  execute: async () => {
    const results: Array<Record<string, unknown>> = [];
    for (const tool of tools) {
      if (tool.name === "send_proposal_outreach" || tool.name === "send_test_email") {
        results.push({ tool: tool.name, status: "skipped", reason: "External send action requires an explicit user-approved send operation." });
        continue;
      }
      const started = Date.now();
      const result = await executeWithBudget(tool, SAFE_TEST_INPUTS[tool.name] ?? {});
      results.push({ tool: tool.name, status: result.status === "success" ? "passed" : result.status === "not_configured" ? "not_configured" : "failed", duration_ms: Date.now() - started, message: result.message, details: result.status === "success" ? "Tool executed successfully with a harmless test input." : undefined });
    }
    return { status: "success", mode: "tool_test", tested_at: new Date().toISOString(), results };
  },
};

tools.push(toolTestTool);

const capabilitiesTool: AgentTool = {
  name: "agent_capabilities",
  description: "Return the capabilities actually registered in the current Sanmine AI runtime. Use this before making claims about available tools.",
  parameters: { type: "object", properties: {}, required: [] },
  execute: async () => ({
    agent: "Samine AI Agent",
    enabled: tools.map((tool) => tool.name),
    note: "Availability means registered in this runtime; configuration and external-provider health are checked when a tool is executed.",
  }),
};
tools.push(capabilitiesTool);

const MINIMUM_COMPLETION_RULE = " GENERAL COMPLETION RULE: If the user's request contains a minimum quantity/count (for example 'minimum 8', 'at least 8', '8 se kam nahi', 'kam se kam 8', 'no less than 8', or '8 or more'), treat that number as a hard completion requirement for the requested qualifying items. Do not claim the task is complete with fewer than that number when more verified qualifying items can still be found. Continue using the appropriate research/search/analyze tools with additional queries or sources until the minimum is met. Never invent or pad results; if the minimum truly cannot be met after reasonable research, explicitly state that the minimum was not met and give the verified count. This rule applies to research, analysis, lead generation, web research, task/work planning, and all other tool-assisted workflows, not only YouTube.";

export function getTools(): AgentTool[] { return tools; }
export function getToolDefinitions(): ToolDefinition[] {
  return tools.map(({ execute: _execute, ...definition }) => ({
    ...definition,
    description: `${definition.description}${MINIMUM_COMPLETION_RULE}`,
  }));
}
export function getTool(name: string): AgentTool | undefined { return tools.find((tool) => tool.name === name); }
