import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/agent";
import type { ChatMessage } from "@/lib/ai/provider";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";

function getCookie(request: Request, name: string) {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? (body.history as ChatMessage[]) : [];
    if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });

    await sql`INSERT INTO users (id, email, name, image) VALUES (${user.uid}, ${user.email ?? ""}, ${user.name ?? null}, ${user.picture ?? null}) ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`;

    let chatId = getCookie(request, "sanmine_chat_id");
    if (chatId) {
      const owned = await sql`SELECT id FROM chats WHERE id = ${chatId} AND user_id = ${user.uid}`;
      if (!owned.length) chatId = null;
    }
    if (!chatId) {
      const title = message.slice(0, 80) || "New chat";
      const rows = await sql`INSERT INTO chats (user_id, title) VALUES (${user.uid}, ${title}) RETURNING id`;
      chatId = String(rows[0].id);
    }

    await sql`INSERT INTO messages (chat_id, role, content) VALUES (${chatId}, 'user', ${message})`;
    const result = await runAgent(history, message);
    await sql`INSERT INTO messages (chat_id, role, content) VALUES (${chatId}, 'assistant', ${result.response})`;
    await sql`UPDATE chats SET updated_at = NOW() WHERE id = ${chatId}`;

    const response = NextResponse.json({ ...result, chatId });
    response.headers.set("x-chat-id", chatId);
    response.cookies.set("sanmine_chat_id", chatId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return response;
  } catch (error) {
    console.error("Chat API error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong." }, { status: error instanceof Error && error.message.includes("authentication") ? 401 : 500 });
  }
}
