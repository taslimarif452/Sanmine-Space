import { getProvider, type ChatMessage } from "@/lib/ai/provider";
import { getTool, getToolDefinitions } from "@/lib/agent/tools";
import type { AgentEvent } from "@/lib/agent/tools/types";

const SYSTEM_PROMPT = `You are Sanmine Space, a practical AI workspace for research, lead generation, and outreach.
Be concise, useful, and transparent. You are the reasoning layer of an agentic system.
You have access to tools. Use a tool when it is necessary to complete the user's request rather than pretending you already have external data.

TOOL ROUTING — IMPORTANT:
- If the user asks about YouTube, YouTubers, creators, channels, channel statistics, creator discovery, or YouTube videos, you MUST use the youtube_search tool first. Do NOT use search_web as a substitute for YouTube data.
- For requests such as "YouTube se 10 creator ka details nikalo", use youtube_search with type="creator" and limit=10. The creator/channel data must come from YouTube Data API v3.
- If the user asks for creators without a website, youtube_search will search a larger candidate set on YouTube and filter using the public YouTube channel description. Treat its returned results as the authoritative YouTube dataset for the answer.
- Never scrape or cite another website as the source of a YouTube creator/channel result when youtube_search is available.
- If youtube_search returns not_configured, clearly report that YOUTUBE_API_KEY is not configured. If it returns a success response with zero results, do NOT blame the API key; report that the normalized YouTube query returned no matching channels.
- If youtube_search returns an API error, clearly report the actual API error and do not silently fall back to random websites.
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
const isYouTubeRequest = (message: string) => /\byoutube\b|\byoutuber(s)?\b|youtube\s*(creator|channel|video)/i.test(message);
const isCreatorRequest = (message: string) => /creator|creators|youtuber|channel|channels|subscriber|followers|views/i.test(message);
const isNoWebsiteRequest = (message: string) => /no\s+(a\s+)?website|without\s+(a\s+)?website|website\s*(nahi|nahin|nhi|nh)|website\s*(is\s*)?not/i.test(message);
const isIndiaRequest = (message: string) => /\bindia\b|\bindian\b|bharat|bhartiya/i.test(message);

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

  // Deterministic YouTube routing: creator/channel/video requests must hit the
  // YouTube Data API v3 tool before the general model can choose web search.
  if (isYouTubeRequest(userMessage)) {
    const youtube = getTool("youtube_search");
    if (!youtube) {
      return { response: "YouTube Data API v3 is not connected in this workspace yet.", events };
    }
    emit({ type: "tool_start", name: "youtube_search", toolCallId: "forced-youtube-search" });
    let result: unknown;
    try {
      result = await youtube.execute({
        query: userMessage,
        limit: 10,
        type: isCreatorRequest(userMessage) || isNoWebsiteRequest(userMessage) ? "creator" : "video",
        region_code: isIndiaRequest(userMessage) ? "IN" : undefined,
      });
    } catch (error) {
      result = { status: "error", source: "YouTube Data API v3", message: error instanceof Error ? error.message : "YouTube search failed." };
    }
    emit({ type: "tool_result", name: "youtube_search", toolCallId: "forced-youtube-search", result });
    messages.push({
      role: "user",
      content: `Authoritative YouTube Data API v3 tool result. Use this result for the YouTube portion of the answer and do not claim the API key is missing unless status is not_configured:\n${JSON.stringify(result)}`,
    });
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await provider.chat(messages, tools);
    if (!response.toolCalls.length) {
      return { response: response.text || "I’m ready. What would you like me to do?", events };
    }

    for (const call of response.toolCalls) {
      const tool = getTool(call.name);
      // Avoid a duplicate YouTube call after deterministic routing unless the
      // model explicitly needs a genuinely different YouTube query.
      if (isYouTubeRequest(userMessage) && call.name === "youtube_search") {
        messages.push({ role: "user", content: "The YouTube Data API v3 search has already been executed. Use that authoritative result to answer the user; do not call youtube_search again." });
        continue;
      }
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
