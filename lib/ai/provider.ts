import type { ToolCall, ToolDefinition } from "@/lib/agent/tools/types";

export type ChatMessage = { role: "user" | "assistant" | "system" | "tool"; content: string; name?: string };
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
