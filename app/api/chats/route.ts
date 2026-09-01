import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";

async function ensureChatTables() {
  await sql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, image TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS chats (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT 'New chat', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS chats_user_updated_idx ON chats(user_id, updated_at DESC)`;
}

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureChatTables();
    const chats = await sql`SELECT id, title, created_at, updated_at FROM chats WHERE user_id = ${user.uid} ORDER BY updated_at DESC LIMIT 100`;
    return NextResponse.json({ chats });
  } catch (error) {
    console.error("Recent chats GET error:", error);
    const message = error instanceof Error ? error.message : "Unable to load recent chats.";
    const isAuth = /authentication|auth|token|credential|unauthorized|missing authentication/i.test(message);
    return NextResponse.json({ error: message }, { status: isAuth ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureChatTables();
    const body = await request.json();
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "New chat";
    const rows = await sql`INSERT INTO chats (user_id, title) VALUES (${user.uid}, ${title}) RETURNING id, title, created_at, updated_at`;
    return NextResponse.json({ chat: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Recent chats POST error:", error);
    const message = error instanceof Error ? error.message : "Unable to create chat.";
    const isAuth = /authentication|auth|token|credential|unauthorized|missing authentication/i.test(message);
    return NextResponse.json({ error: message }, { status: isAuth ? 401 : 500 });
  }
}
