import { getProvider, type ChatMessage } from "@/lib/ai/provider";

const SYSTEM_PROMPT = `You are Sanmine Space, a practical AI workspace for research and outreach.
Be concise, useful, and transparent. You are the reasoning layer of an agentic system.
When tools are added, explain what you are doing and never claim an external action happened unless a tool confirms it.`;

export async function runAgent(history: ChatMessage[], userMessage: string) {
  const provider = getProvider();
  return provider.chat([
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-12),
    { role: "user", content: userMessage },
  ]);
}
