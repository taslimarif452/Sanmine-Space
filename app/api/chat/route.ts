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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const isSimpleGreeting = (message: string) =>
  /^(hi|hello|hey|hii|hiii|helo|hola|namaste|good\s+(morning|afternoon|evening|night))\s*[!.?]*$/i.test(message.trim());

function isLowQualityAnswer(text: string) {
  const value = text.trim();
  if (!value) return true;
  if (/^i[’']m ready\. what would you like me to do\??$/i.test(value)) return true;
  if (/^i'?m ready\. what would you like me to do\??$/i.test(value)) return true;
  if (/svgSources|<svg|\[svg\]|tool_result|raw tool|functionCall|functionResponse/i.test(value)) return true;
  return false;
}

function buildResearchFallback(events: AgentEvent[], userMessage: string) {
  const results: Array<{ title: string; url: string; snippet?: string }> = [];
  const statuses: string[] = [];
  for (const event of events) {
    if (event.type !== "tool_result") continue;
    const result = event.result as any;
    if (!result || typeof result !== "object") continue;
    if (result.status && result.status !== "success") statuses.push(`${event.name}: ${String(result.message || result.status)}`);
    if (Array.isArray(result.results)) {
      for (const item of result.results) {
        if (item?.url) results.push({ title: String(item.title || "Web source"), url: String(item.url), snippet: item.snippet ? String(item.snippet) : undefined });
      }
    }
    if (result.url) results.push({ title: String(result.title || result.url), url: String(result.url), snippet: typeof result.text === "string" ? result.text.slice(0, 220) : undefined });
  }
  const unique = [...new Map(results.map((item) => [item.url, item])).values()].slice(0, 8);
  if (!unique.length && statuses.length) {
    return `I couldn’t complete the requested research because a required tool is unavailable.\n\n${statuses.map((s) => `- ${s}`).join("\n")}`;
  }
  if (!unique.length) return `I started the requested research for **${userMessage.slice(0, 100)}**, but the research tools did not return usable source data. Please try the request again.`;
  return `## Research results\n\nI completed the web research and found **${unique.length} source${unique.length === 1 ? "" : "s"}**.\n\n${unique.map((item, index) => `${index + 1}. **${item.title}**\n   ${item.url}${item.snippet ? `\n   ${item.snippet.replace(/\s+/g, " ").slice(0, 220)}` : ""}`).join("\n\n")}`;
}

async function prepareChat(user: Awaited<ReturnType<typeof getRequestUser>>, message: string, requestedChatId?: string | null) {
  if (!hasDatabaseConfig()) return null;
  try {
    await runProductionMigrations();
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
    if (!existingUser.length) await sql`INSERT INTO messages (chat_id, role, content) VALUES (${chatId}, ${'user'}, ${message})`;
    await sql`UPDATE chats SET title = CASE WHEN title = 'New chat' THEN ${message.slice(0, 120)} ELSE title END, updated_at = NOW() WHERE id = ${chatId} AND user_id = ${user.uid}`;
    return chatId;
  } catch (error) {
    console.error("Chat preparation warning:", error);
    return null;
  }
}

async function persistAssistant(user: Awaited<ReturnType<typeof getRequestUser>>, chatId: string | null, responseText: string) {
  if (!chatId || !hasDatabaseConfig()) return false;
  try {
    await sql`INSERT INTO messages (chat_id, role, content) VALUES (${chatId}, ${'assistant'}, ${responseText})`;
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
        const send = (payload: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        try {
          send({ type: "event", event: { type: "thinking", name: "request_start", toolCallId: `request-${Date.now()}` } });
          await runProductionMigrations();
          await enforceRateLimit(`chat:${user.uid}`, 30, 60_000);
          const chatId = await prepareChat(user, message, requestedChatId);
          if (chatId) send({ type: "chat", chatId });

          if (isSimpleGreeting(message)) {
            const greetingResponse = "Hi! 👋 How can I help you today?";
            await persistAssistant(user, chatId, greetingResponse);
            send({ type: "delta", delta: greetingResponse });
            send({ type: "done", response: greetingResponse, events: [], chatId, persistence: chatId ? "saved" : "unavailable" });
            controller.close();
            return;
          }

          const result = await runAgent(
            chatHistory,
            message,
            (event) => send({ type: "event", event }),
            user.uid,
            (delta) => send({ type: "delta", delta }),
          );
          const responseText = isLowQualityAnswer(result.response) ? buildResearchFallback(result.events, message) : result.response.trim();
          const saved = await persistAssistant(user, chatId, responseText);
          send({ type: "done", response: responseText, events: result.events.filter((event) => event.type !== "thinking"), chatId, persistence: saved ? "saved" : "unavailable" });
          controller.close();
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "Something went wrong while processing the chat request.";
          console.error("Chat stream error:", error);
          send({ type: "error", error: messageText, code: /not configured|api key|private key/i.test(messageText) ? "CONFIG_ERROR" : "CHAT_ERROR" });
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (error) {
    return NextResponse.json(errorResponse(error, "Something went wrong while processing the chat request."), { status: errorStatus(error) });
  }
}
