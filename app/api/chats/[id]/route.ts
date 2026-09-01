import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { hasDatabaseConfig, sql } from "@/lib/db/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureMessageTable() {
  await sql`CREATE TABLE IF NOT EXISTS messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('user','assistant')), content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS messages_chat_created_idx ON messages(chat_id, created_at ASC)`;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request);
    if (!hasDatabaseConfig()) return NextResponse.json({ messages: [], persistence: "unavailable" });

    const { id } = await context.params;
    await ensureMessageTable();
    const owned = await sql`SELECT id, title, created_at, updated_at FROM chats WHERE id = ${id} AND user_id = ${user.uid} LIMIT 1`;
    if (!owned.length) return NextResponse.json({ error: "Chat not found." }, { status: 404 });

    const messages = await sql`SELECT id, role, content, created_at FROM messages WHERE chat_id = ${id} ORDER BY created_at ASC`;
    return NextResponse.json({ chat: owned[0], messages, persistence: "saved" });
  } catch (error) {
    console.error("Chat history GET error:", error);
    const message = error instanceof Error ? error.message : "Unable to load chat history.";
    const auth = /authentication|auth|token|credential|unauthorized|firebase/i.test(message);
    return NextResponse.json({ error: message }, { status: auth ? 401 : 503 });
  }
}
