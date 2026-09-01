import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { hasDatabaseConfig, sql } from "@/lib/db/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownedChat(id: string, uid: string) {
  return sql`SELECT id, title, created_at, updated_at FROM chats WHERE id = ${id} AND user_id = ${uid} LIMIT 1`;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request);
    if (!hasDatabaseConfig()) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
    const { id } = await context.params;
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
    if (!title) return NextResponse.json({ error: "Chat name is required." }, { status: 400 });
    const rows = await sql`UPDATE chats SET title = ${title}, updated_at = NOW() WHERE id = ${id} AND user_id = ${user.uid} RETURNING id, title, created_at, updated_at`;
    if (!rows.length) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    return NextResponse.json({ chat: rows[0] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to rename chat." }, { status: 503 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request);
    if (!hasDatabaseConfig()) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
    const { id } = await context.params;
    const rows = await ownedChat(id, user.uid);
    if (!rows.length) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    await sql`DELETE FROM chats WHERE id = ${id} AND user_id = ${user.uid}`;
    return NextResponse.json({ ok: true, id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete chat." }, { status: 503 }); }
}
