import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { hasDatabaseConfig, sql } from "@/lib/db/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureMessageTable() {
  await sql`CREATE TABLE IF NOT EXISTS messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('user','assistant')), content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`;
  await sql`CREATE INDEX IF NOT EXISTS messages_chat_created_idx ON messages(chat_id, created_at ASC)`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request);
    if (!hasDatabaseConfig()) return NextResponse.json({ messages: [], persistence: "unavailable" });
    const { id } = await context.params;
    await ensureMessageTable();

    const owned = isUuid(id)
      ? await sql`SELECT id, title, created_at, updated_at FROM chats WHERE id = ${id} AND user_id = ${user.uid} LIMIT 1`
      : await sql`SELECT id, title, created_at, updated_at FROM chats WHERE user_id = ${user.uid} AND LOWER(REGEXP_REPLACE(REGEXP_REPLACE(title, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) = LOWER(${id}) LIMIT 1`;

    if (!owned.length) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    const chatId = owned[0].id;
    const messages = await sql`SELECT id, role, content, metadata, created_at FROM messages WHERE chat_id = ${chatId} ORDER BY created_at ASC`;
    return NextResponse.json({ chat: owned[0], messages, persistence: "saved" });
  } catch (error) {
    console.error("Chat history GET error:", error);
    const message = error instanceof Error ? error.message : "Unable to load chat history.";
    const auth = /authentication|auth|token|credential|unauthorized|firebase/i.test(message);
    return NextResponse.json({ error: message }, { status: auth ? 401 : 503 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request);
    if (!hasDatabaseConfig()) return NextResponse.json({ error: "Database persistence is not configured." }, { status: 503 });

    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid chat id." }, { status: 400 });

    const result = await sql`
      DELETE FROM chats
      WHERE id = ${id} AND user_id = ${user.uid}
      RETURNING id
    `;

    if (!result.length) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    return NextResponse.json({ deleted: true, chatId: id });
  } catch (error) {
    console.error("Chat delete error:", error);
    const message = error instanceof Error ? error.message : "Unable to delete chat.";
    const auth = /authentication|auth|token|credential|unauthorized|firebase/i.test(message);
    return NextResponse.json({ error: message }, { status: auth ? 401 : 503 });
  }
}
