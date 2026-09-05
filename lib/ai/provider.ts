import type { ToolCall, ToolDefinition } from "@/lib/agent/tools/types";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string; name?: string };
export type AIProviderName = "gemini" | "openrouter";
export type ProviderResponse = { text: string; toolCalls: ToolCall[]; raw?: unknown };
export interface AIProvider {
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ProviderResponse>;
  chatStream(messages: ChatMessage[], tools?: ToolDefinition[], onText?: (delta: string) => void): Promise<ProviderResponse>;
}

export function getProvider(): AIProvider {
  const selected = (process.env.AI_PROVIDER || "gemini").trim().toLowerCase();
  return selected === "openrouter" ? new ResilientProvider(new OpenRouterProvider(), new GeminiProvider()) : new ResilientProvider(new GeminiProvider(), new OpenRouterProvider());
}

class ResilientProvider implements AIProvider {
  constructor(private readonly primary: AIProvider, private readonly fallback: AIProvider) {}

  async chat(messages: ChatMessage[], tools: ToolDefinition[] = []): Promise<ProviderResponse> {
    try {
      return await this.primary.chat(messages, tools);
    } catch (primaryError) {
      try {
        return await this.fallback.chat(messages, tools);
      } catch (fallbackError) {
        const primaryMessage = primaryError instanceof Error ? primaryError.message : "Primary provider failed.";
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Fallback provider failed.";
        throw new Error(`AI providers failed. Primary: ${primaryMessage} Fallback: ${fallbackMessage}`);
      }
    }
  }

  async chatStream(messages: ChatMessage[], tools: ToolDefinition[] = [], onText?: (delta: string) => void): Promise<ProviderResponse> {
    try {
      return await this.primary.chatStream(messages, tools, onText);
    } catch (primaryError) {
      try {
        return await this.fallback.chatStream(messages, tools, onText);
      } catch (fallbackError) {
        const primaryMessage = primaryError instanceof Error ? primaryError.message : "Primary provider failed.";
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Fallback provider failed.";
        throw new Error(`AI providers failed. Primary: ${primaryMessage} Fallback: ${fallbackMessage}`);
      }
    }
  }
}

async function readProviderError(response: Response, provider: string) {
  const raw = await response.text();
  let detail = raw || "No response body returned.";
  try {
    const parsed = JSON.parse(raw);
    detail = parsed?.error?.message || parsed?.message || raw || detail;
  } catch { /* provider returned non-JSON */ }
  return `${provider} request failed (${response.status}): ${String(detail).slice(0, 500)}`;
}

async function readSse(response: Response, onData: (data: any) => void) {
  if (!response.body) throw new Error("AI provider returned no response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") continue;
      try { onData(JSON.parse(data)); } catch { /* ignore incomplete/non-JSON SSE blocks */ }
    }
  }
  buffer += decoder.decode();
  const data = buffer.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
  if (data && data !== "[DONE]") {
    try { onData(JSON.parse(data)); } catch { /* ignore malformed final block */ }
  }
}

class GeminiProvider implements AIProvider {
  async chat(messages: ChatMessage[], tools: ToolDefinition[] = []): Promise<ProviderResponse> {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new Error("GEMINI_API_KEY is not configured in Vercel.");
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
    const contents = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const system = messages.find((m) => m.role === "system")?.content;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents, ...(tools.length ? { tools: [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })) }] } : {}) }),
    });
    if (!response.ok) throw new Error(await readProviderError(response, `Gemini ${model}`));
    const data = await response.json();
    return parseGeminiResponse(data);
  }

  async chatStream(messages: ChatMessage[], tools: ToolDefinition[] = [], onText?: (delta: string) => void): Promise<ProviderResponse> {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new Error("GEMINI_API_KEY is not configured in Vercel.");
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
    const contents = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const system = messages.find((m) => m.role === "system")?.content;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents, ...(tools.length ? { tools: [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })) }] } : {}) }),
    });
    if (!response.ok) throw new Error(await readProviderError(response, `Gemini ${model}`));
    const parts: Array<{ text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }> = [];
    await readSse(response, (data) => {
      for (const part of data.candidates?.[0]?.content?.parts || []) {
        parts.push(part);
        if (part.text) onText?.(part.text);
      }
    });
    const text = parts.map((p) => p.text || "").join("");
    const toolCalls: ToolCall[] = parts.filter((p) => p.functionCall?.name).map((p, index) => ({ id: `gemini_${Date.now()}_${index}`, name: p.functionCall!.name!, arguments: p.functionCall!.args || {} }));
    return { text, toolCalls, raw: parts };
  }
}

function parseGeminiResponse(data: any): ProviderResponse {
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p: { text?: string }) => p.text || "").join("");
  const toolCalls: ToolCall[] = parts.filter((p: { functionCall?: { name?: string } }) => p.functionCall?.name).map((p: { functionCall: { name: string; args?: Record<string, unknown> } }, index: number) => ({ id: `gemini_${Date.now()}_${index}`, name: p.functionCall.name, arguments: p.functionCall.args || {} }));
  return { text, toolCalls, raw: data };
}

class OpenRouterProvider implements AIProvider {
  async chat(messages: ChatMessage[], tools: ToolDefinition[] = []): Promise<ProviderResponse> {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) throw new Error("OPENROUTER_API_KEY is not configured in Vercel.");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", "X-Title": "Sanmine Space" },
      body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || "openrouter/free", messages, ...(tools.length ? { tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })), tool_choice: "auto" } : {}) }),
    });
    if (!response.ok) throw new Error(await readProviderError(response, "OpenRouter"));
    const data = await response.json();
    return parseOpenRouterResponse(data);
  }

  async chatStream(messages: ChatMessage[], tools: ToolDefinition[] = [], onText?: (delta: string) => void): Promise<ProviderResponse> {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) throw new Error("OPENROUTER_API_KEY is not configured in Vercel.");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", "X-Title": "Sanmine Space" },
      body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || "openrouter/free", messages, stream: true, ...(tools.length ? { tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })), tool_choice: "auto" } : {}) }),
    });
    if (!response.ok) throw new Error(await readProviderError(response, "OpenRouter"));
    let text = "";
    const toolMap = new Map<string, { id: string; name: string; arguments: string }>();
    await readSse(response, (data) => {
      const choice = data.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) {
        text += String(delta.content);
        onText?.(String(delta.content));
      }
      for (const call of delta?.tool_calls || []) {
        const id = String(call.id || call.index || `openrouter_${Date.now()}`);
        const current = toolMap.get(id) || { id, name: "", arguments: "" };
        if (call.function?.name) current.name += String(call.function.name);
        if (call.function?.arguments) current.arguments += String(call.function.arguments);
        toolMap.set(id, current);
      }
    });
    const toolCalls: ToolCall[] = [...toolMap.values()].filter((call) => call.name).map((call) => ({ id: call.id, name: call.name, arguments: safeJson(call.arguments) }));
    return { text, toolCalls };
  }
}

function parseOpenRouterResponse(data: any): ProviderResponse {
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("OpenRouter returned no assistant message.");
  const toolCalls: ToolCall[] = (message.tool_calls || []).map((call: { id: string; function: { name: string; arguments?: string } }) => ({ id: call.id, name: call.function.name, arguments: safeJson(call.function.arguments) }));
  return { text: message.content || "", toolCalls, raw: data };
}

function safeJson(value?: string): Record<string, unknown> {
  if (!value) return {};
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}
