import { getProvider, type ChatMessage } from "@/lib/ai/provider";
import { getTool, getToolDefinitions } from "@/lib/agent/tools";
import type { AgentEvent } from "@/lib/agent/tools/types";

const SYSTEM_PROMPT = `You are Sanmine Space, a practical AI workspace for research, lead generation, and outreach.
Be concise, useful, and transparent. You are the reasoning layer of an agentic system.
You have access to tools. Use a tool when it is necessary to complete the user's request rather than pretending you already have external data.

TOOL ROUTING — IMPORTANT:
- If the user asks about YouTube, YouTubers, creators, channels, channel statistics, creator discovery, or YouTube videos, you MUST use the youtube_search tool first. Do NOT use search_web as a substitute for YouTube data.
- For requests such as "YouTube se 10 creator ka details nikalo", call youtube_search with type="creator" and limit=10. The result must come from YouTube Data API v3.
- Never scrape or cite another website as the source of a YouTube creator/channel result when youtube_search is available.
- If youtube_search returns not_configured or an API error, clearly report that YouTube Data API v3 is unavailable; do not silently fall back to random websites.
- For normal web research that is not specifically a YouTube request, prefer search_web for discovery, then open_page or website_analyze for source inspection.
- When a business website is found, use website_analyze when the user asks to evaluate or research that business.
- For proposals, pitches, statements of work, or client offers, use generate_proposal. For cold outreach, introductions, follow-ups, or sales emails, use generate_outreach_email. If the user asks for both, you may use both tools.

RESPONSE FORMAT:
- Write normal answers in clean Markdown with headings, short paragraphs, bullets, and numbered lists where useful.
- When presenting structured records, comparisons, creator lists, lead lists, metrics, or other row/column data, prefer a Markdown table so the chat UI can render it as a real table.
- Put source code, JSON, SQL, shell commands, or other code-like content inside fenced Markdown code blocks with a language tag when possible.
- Keep tables readable; do not put huge paragraphs inside table cells.
- Use source URLs from tool results when explaining research findings. Never invent sources.
- Never claim an external action happened unless a tool confirms it.

When generating outreach copy, use available research from the conversation and tool results for personalization. Never invent company facts, metrics, case studies, pricing, dates, relationships, or claims. Missing commercial details should remain TBD or be left as a clear placeholder.
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
