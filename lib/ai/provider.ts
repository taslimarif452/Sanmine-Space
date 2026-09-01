import type { ToolCall, ToolDefinition } from "@/lib/agent/tools/types";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AIProviderName = "gemini" | "openrouter";

export type ProviderResponse = {
  text: string;
  toolCalls: ToolCall[];
  raw?: unknown;
};

export interface AIProvider {
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ProviderResponse>;
}

export function getProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || "gemini";
  if (provider === "openrouter") return new OpenRouterProvider();
  return new GeminiProvider();
}

class GeminiProvider implements AIProvider {
  async chat(messages: ChatMessage[], tools: ToolDefinition[] = []): Promise<ProviderResponse> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not configured");

    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const system = messages.find((m) => m.role === "system")?.content;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents,
          ...(tools.length
            ? {
                tools: [
                  {
                    functionDeclarations: tools.map((tool) => ({
                      name: tool.name,
                      description: tool.description,
                      parameters: tool.parameters,
                    })),
                  },
                ],
              }
            : {}),
          generationConfig: { temperature: 0.4 },
        }),
      },
    );

    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p: { text?: string }) => p.text || "").join("");
    const toolCalls: ToolCall[] = parts
      .filter((p: { functionCall?: { name?: string; args?: Record<string, unknown> } }) => p.functionCall?.name)
      .map((p: { functionCall: { name: string; args?: Record<string, unknown> } }, index: number) => ({
        id: `gemini_${Date.now()}_${index}`,
        name: p.functionCall.name,
        arguments: p.functionCall.args || {},
      }));

    return { text, toolCalls, raw: data };
  }
}

class OpenRouterProvider implements AIProvider {
  async chat(messages: ChatMessage[], tools: ToolDefinition[] = []): Promise<ProviderResponse> {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY is not configured");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Sanmine Space",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openrouter/free",
        messages,
        ...(tools.length
          ? {
              tools: tools.map((tool) => ({
                type: "function",
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                },
              })),
              tool_choice: "auto",
            }
          : {}),
        temperature: 0.4,
      }),
    });

    if (!response.ok) throw new Error(`OpenRouter request failed: ${response.status}`);
    const data = await response.json();
    const choice = data.choices?.[0];
    const message = choice?.message;
    const toolCalls: ToolCall[] = (message?.tool_calls || []).map(
      (call: { id: string; function: { name: string; arguments?: string } }) => ({
        id: call.id,
        name: call.function.name,
        arguments: safeJson(call.function.arguments),
      }),
    );

    return { text: message?.content || "", toolCalls, raw: data };
  }
}

function safeJson(value?: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
