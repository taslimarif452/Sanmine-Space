import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";

export async function GET(request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const user = await getRequestUser(request);
    const { chatId } = await context.params;
    const messages = await sql`SELECT m.id, m.role, m.content, m.created_at FROM messages m JOIN chats c ON c.id = m.chat_id WHERE m.chat_id = ${chatId} AND c.user_id = ${user.uid} ORDER BY m.created_at ASC`;
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const user = await getRequestUser(request);
    const { chatId } = await context.params;
    const body = await request.json();
    const role = body.role === "assistant" ? "assistant" : "user";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });
    const ownership = await sql`SELECT id FROM chats WHERE id = ${chatId} AND user_id = ${user.uid}`;
    if (!ownership.length) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    const rows = await sql`INSERT INTO messages (chat_id, role, content) VALUES (${chatId}, ${role}, ${content}) RETURNING id, role, content, created_at`;
    await sql`UPDATE chats SET updated_at = NOW() WHERE id = ${chatId}`;
    return NextResponse.json({ message: rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 });
  }
}
