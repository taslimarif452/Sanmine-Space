import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/agent";
import type { ChatMessage } from "@/lib/ai/provider";
import type { AgentEvent } from "@/lib/agent/tools/types";
import { getRequestUser } from "@/lib/auth/request-user";
import { hasDatabaseConfig, sql } from "@/lib/db/neon";
import { runProductionMigrations } from "@/lib/db/migrations";
import { ChatRequestSchema } from "@/lib/api/schemas";
import { AppError, errorResponse, errorStatus } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { executeWithRetry, isToolTestRequest, isUnsafeAssistantOutput, normalizeToolResult, runSafeToolTest, MODEL_TIMEOUT_MS } from "@/lib/agent/reliability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const isSimpleGreeting = (message: string) => /^(hi|hello|hey|hii|hiii|helo|hola|namaste|good\s+(morning|afternoon|evening|night))\s*[!.?]*$/i.test(message.trim());

function buildResearchFallback(events: AgentEvent[], userMessage: string) {
  const results: Array<{ title: string; url: string; snippet?: string }> = [];
  const statuses: string[] = [];
  for (const event of events) {
    if (event.type !== "tool_result") continue;
    const result = event.result as any;
    if (!result || typeof result !== "object") continue;
    if (result.status && result.status !== "success") statuses.push(`${event.name}: ${String(result.message || result.status)}`);
    if (Array.isArray(result.results)) for (const item of result.results) if (item?.url) results.push({ title: String(item.title || "Web source"), url: String(item.url), snippet: item.snippet ? String(item.snippet) : undefined });
    if (result.url) results.push({ title: String(result.title || result.url), url: String(result.url), snippet: typeof result.text === "string" ? result.text.slice(0, 220) : undefined });
  }
  const unique = [...new Map(results.map((item) => [item.url, item])).values()].slice(0, 8);
  if (!unique.length && statuses.length) return `I couldn't complete the requested research because a required tool failed.\n\n${statuses.map((s) => `- ${s}`).join("\n")}`;
  if (!unique.length) return `I started the requested research for **${userMessage.slice(0, 100)}**, but the research tools did not return usable source data. Please try the request again.`;
  return `## Research results\n\nI completed the web research and found **${unique.length} source${unique.length === 1 ? "" : "s"}**.\n\n${unique.map((item, index) => `${index + 1}. **${item.title}**\n   ${item.url}${item.snippet ? `\n   ${item.snippet.replace(/\s+/g, " ").slice(0, 220)}` : ""}`).join("\n\n")}`;
}

async function prepareChat(user: Awaited<ReturnType<typeof getRequestUser>>, message: string, requestedChatId?: string | null) {
  if (!hasDatabaseConfig()) return null;
  try {
    await sql`INSERT INTO users (id, email, name, image) VALUES (${user.uid}, ${user.email ?? `${user.uid}@unknown.local`}, ${user.name ?? null}, ${user.picture ?? null}) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, image = EXCLUDED.image, updated_at = NOW()`;
    let chatId = requestedChatId || null;
    if (chatId) {
      const owned = await sql`SELECT id FROM chats WHERE id = ${chatId} AND user_id = ${user.uid} LIMIT 1`;
      if (!owned.length) chatId = null;
    }
    if (!chatId) {
      const rows = await sql`INSERT INTO chats (user_id, title) VALUES (${user.uid}, 'New chat') RETURNING id`;
      chatId = String(rows[0].id);
    }
    const existingUser = await sql`SELECT id FROM messages WHERE chat_id = ${chatId} AND role = 'user' AND content = ${message} AND created_at > NOW() - INTERVAL '2 minutes' ORDER BY created_at DESC LIMIT 1`;
    if (!existingUser.length) await sql`INSERT INTO messages (chat_id, role, content, metadata) VALUES (${chatId}, 'user', ${message}, ${JSON.stringify({ kind: "user_message", createdAt: new Date().toISOString() })}::jsonb)`;
    await sql`UPDATE chats SET title = CASE WHEN title = 'New chat' THEN ${message.slice(0, 120)} ELSE title END, updated_at = NOW() WHERE id = ${chatId} AND user_id = ${user.uid}`;
    return chatId;
  } catch (error) {
    console.error("Chat preparation warning:", error);
    return null;
  }
}

async function persistAssistant(user: Awaited<ReturnType<typeof getRequestUser>>, chatId: string | null, responseText: string, metadata: Record<string, unknown>) {
  if (!chatId || !hasDatabaseConfig()) return false;
  try {
    await sql`INSERT INTO messages (chat_id, role, content, metadata) VALUES (${chatId}, 'assistant', ${responseText}, ${JSON.stringify(metadata)}::jsonb)`;
    await sql`UPDATE chats SET updated_at = NOW() WHERE id = ${chatId} AND user_id = ${user.uid}`;
    return true;
  } catch (error) {
    console.error("Assistant persistence warning:", error);
    return false;
  }
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof getRequestUser>>;
  try { user = await getRequestUser(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Authentication failed.", code: "AUTH_ERROR" }, { status: 401 }); }

  try {
    if (!hasDatabaseConfig()) throw new AppError("CONFIG_ERROR", "Database persistence is not configured.", 503);
    const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", parsed.error.issues[0]?.message || "Invalid chat request.", 400);
    const { message, history, chatId: requestedChatId } = parsed.data;
    const chatHistory = history as ChatMessage[];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (payload: Record<string, unknown>) => { if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`)); };
        const startAt = Date.now();
        try {
          send({ type: "event", event: { type: "thinking", name: "request_start", toolCallId: `request-${Date.now()}` } });
          await enforceRateLimit(`chat:${user.uid}`, 30, 60_000);
          const chatId = await prepareChat(user, message, requestedChatId);
          if (chatId) send({ type: "chat", chatId });

          if (isSimpleGreeting(message)) {
            const greetingResponse = "Hi! 👋 How can I help you today?";
            await persistAssistant(user, chatId, greetingResponse, { kind: "chat_response", mode: "greeting", durationMs: Date.now() - startAt });
            send({ type: "delta", delta: greetingResponse });
            send({ type: "done", response: greetingResponse, events: [], chatId, metadata: { mode: "greeting" }, persistence: chatId ? "saved" : "unavailable" });
            closed = true; controller.close(); return;
          }

          if (isToolTestRequest(message)) {
            send({ type: "event", event: { type: "thinking", name: "tool_test", toolCallId: `tool-test-${Date.now()}` } });
            const report = await runSafeToolTest((event) => send({ type: "event", event }));
            const passed = report.filter((x) => x.status === "passed").length;
            const response = ["## Tool health check", "", `Tested **${report.length}** safe tools: **${passed} passed**.`, "", "| Tool | Status | Details |", "| --- | --- | --- |", ...report.map((x) => `| ${x.tool} | ${x.status === "passed" ? "✅ Passed" : x.status === "unavailable" ? "⚪ Unavailable" : "❌ Failed"} | ${x.message.replace(/\|/g, "\\|")} |`)].join("\n");
            const saved = await persistAssistant(user, chatId, response, { kind: "tool_test", report, durationMs: Date.now() - startAt });
            send({ type: "delta", delta: response });
            send({ type: "done", response, events: [], chatId, metadata: { mode: "tool_test", report }, persistence: saved ? "saved" : "unavailable" });
            closed = true; controller.close(); return;
          }

          const rawEvents: AgentEvent[] = [];
          let streamed = "";
          const result = await executeWithRetry(
            () => runAgent(chatHistory, message, (event) => {
              const safeEvent = event.type === "tool_result" ? { ...event, result: normalizeToolResult(event.name, event.toolCallId, event.result).result } : event;
              rawEvents.push(safeEvent);
              send({ type: "event", event: safeEvent });
            }, user.uid, (delta) => {
              if (!delta) return;
              streamed += delta;
              send({ type: "delta", delta });
            }),
            "Agent run",
            MODEL_TIMEOUT_MS * 4,
          );
          const events = rawEvents.length ? rawEvents : result.events;
          let responseText = result.response?.trim() || streamed.trim();
          if (isUnsafeAssistantOutput(responseText)) responseText = buildResearchFallback(events, message);
          if (!responseText) throw new Error("The AI completed without producing a usable answer.");
          const metadata = { kind: "chat_response", durationMs: Date.now() - startAt, eventCount: events.length, toolCount: events.filter((e) => e.type === "tool_start").length, sources: events.filter((e) => e.type === "tool_result").map((e) => ({ name: e.name, toolCallId: e.toolCallId })) };
          const saved = await persistAssistant(user, chatId, responseText, metadata);
          send({ type: "done", response: responseText, events: events.filter((event) => event.type !== "thinking"), chatId, metadata, persistence: saved ? "saved" : "unavailable" });
          closed = true; controller.close();
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "Something went wrong while processing the chat request.";
          console.error("Chat stream error:", error);
          send({ type: "error", error: messageText, code: /not configured|api key|private key/i.test(messageText) ? "CONFIG_ERROR" : /timed out/i.test(messageText) ? "TIMEOUT" : "CHAT_ERROR" });
          closed = true; controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (error) {
    return NextResponse.json(errorResponse(error, "Something went wrong while processing the chat request."), { status: errorStatus(error) });
  }
}
