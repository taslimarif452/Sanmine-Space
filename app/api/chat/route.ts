import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/agent";
import type { ChatMessage } from "@/lib/ai/provider";
import { getRequestUser } from "@/lib/auth/request-user";
import { hasDatabaseConfig, sql } from "@/lib/db/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function persistChat(user: Awaited<ReturnType<typeof getRequestUser>>, message: string, responseText: string, requestedChatId?: string | null) {
  if (!hasDatabaseConfig()) return null;
  try {
    await sql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, image TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`CREATE TABLE IF NOT EXISTS chats (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT 'New chat', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`CREATE TABLE IF NOT EXISTS messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('user','assistant')), content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`CREATE INDEX IF NOT EXISTS chats_user_updated_idx ON chats(user_id, updated_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS messages_chat_created_idx ON messages(chat_id, created_at ASC)`;
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
    await sql`INSERT INTO messages (chat_id, role, content) VALUES (${chatId}, 'user', ${message})`;
    await sql`INSERT INTO messages (chat_id, role, content) VALUES (${chatId}, 'assistant', ${responseText})`;
    await sql`UPDATE chats SET title = CASE WHEN title = 'New chat' THEN ${message.slice(0, 120)} ELSE title END, updated_at = NOW() WHERE id = ${chatId} AND user_id = ${user.uid}`;
    return chatId;
  } catch (error) {
    console.error("Chat persistence warning:", error);
    return null;
  }
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof getRequestUser>>;
  try { user = await getRequestUser(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Authentication failed.", code: "AUTH_ERROR" }, { status: 401 }); }
  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? (body.history as ChatMessage[]) : [];
    const requestedChatId = typeof body.chatId === "string" && body.chatId ? body.chatId : null;
    if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ async start(controller) {
      const send = (payload: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      try {
        send({ type: "status", status: "thinking" });
        const result = await runAgent(history, message, (event) => send({ type: "event", event }));
        const chatId = await persistChat(user, message, result.response, requestedChatId);
        send({ type: "done", response: result.response || "I’m ready. What would you like me to do?", events: result.events, chatId, persistence: chatId ? "saved" : "unavailable" });
        controller.close();
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "Something went wrong while processing the chat request.";
        console.error("Chat stream error:", error);
        send({ type: "error", error: messageText, code: /not configured|api key|private key/i.test(messageText) ? "CONFIG_ERROR" : "CHAT_ERROR" });
        controller.close();
      }
    }});
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong while processing the chat request." }, { status: 500 }); }
}
