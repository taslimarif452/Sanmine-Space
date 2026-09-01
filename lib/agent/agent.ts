import { getProvider, type ChatMessage } from "@/lib/ai/provider";
import { getTool, getToolDefinitions } from "@/lib/agent/tools";
import type { AgentEvent } from "@/lib/agent/tools/types";

const SYSTEM_PROMPT = `You are Sanmine Space, a practical AI workspace for research and outreach.
Be concise, useful, and transparent. You are the reasoning layer of an agentic system.
You have access to tools. Use a tool when it is necessary to complete the user's request rather than pretending you already have external data.
For web research, prefer search_web for discovery, then open_page or website_analyze for source inspection. When a business website is found, use website_analyze when the user asks to evaluate or research that business.
Use source URLs from tool results when explaining research findings. Never invent sources.
Never claim an external action happened unless a tool confirms it.
If a requested tool is unavailable or returns not_configured, clearly say that capability is not connected yet.`;

const MAX_TOOL_ROUNDS = 8;

export async function runAgent(history: ChatMessage[], userMessage: string, onEvent?: (event: AgentEvent) => void) {
  const provider = getProvider();
  const tools = getToolDefinitions();
  const events: AgentEvent[] = [];
  const emit = (event: AgentEvent) => { events.push(event); onEvent?.(event); };
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-12),
    { role: "user", content: userMessage },
  ];

  emit({ type: "thinking" });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await provider.chat(messages, tools);
    if (!response.toolCalls.length) {
      return { response: response.text || "I’m ready. What would you like me to do?", events };
    }

    for (const call of response.toolCalls) {
      const tool = getTool(call.name);
      emit({ type: "tool_start", name: call.name, toolCallId: call.id });
      let result: unknown;
      if (!tool) result = { status: "error", message: `Unknown tool: ${call.name}` };
      else {
        try { result = await tool.execute(call.arguments); }
        catch (error) { result = { status: "error", message: error instanceof Error ? error.message : "Tool execution failed." }; }
      }
      emit({ type: "tool_result", name: call.name, toolCallId: call.id, result });
      if (response.text) messages.push({ role: "assistant", content: response.text });
      messages.push({ role: "user", content: `Tool result for ${call.name} (call ${call.id}):\n${JSON.stringify(result)}` });
    }
  }

  return { response: "I reached the tool-call limit for this request. Please try the task again.", events };
}
