import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { hasDatabaseConfig, sql } from "@/lib/db/neon";

async function ensureChatTables() {
  await sql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, image TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS chats (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT 'New chat', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS chats_user_updated_idx ON chats(user_id, updated_at DESC)`;
}

function isAuthError(message: string) {
  return /authentication|auth|token|credential|unauthorized|missing authentication/i.test(message);
}

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!hasDatabaseConfig()) {
      return NextResponse.json({ chats: [], persistence: "unavailable", warning: "Neon DATABASE_URL is not configured." });
    }

    await ensureChatTables();
    const chats = await sql`SELECT id, title, created_at, updated_at FROM chats WHERE user_id = ${user.uid} ORDER BY updated_at DESC LIMIT 100`;
    return NextResponse.json({ chats, persistence: "saved" });
  } catch (error) {
    console.error("Recent chats GET error:", error);
    const message = error instanceof Error ? error.message : "Unable to load recent chats.";
    if (isAuthError(message)) return NextResponse.json({ error: message, code: "AUTH_ERROR" }, { status: 401 });

    // Chat should not be blocked by a temporary persistence/database problem.
    return NextResponse.json({ chats: [], persistence: "unavailable", warning: message.slice(0, 300) });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!hasDatabaseConfig()) return NextResponse.json({ error: "Neon DATABASE_URL is not configured.", code: "CONFIG_ERROR" }, { status: 503 });

    await ensureChatTables();
    const body = await request.json();
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "New chat";
    const rows = await sql`INSERT INTO chats (user_id, title) VALUES (${user.uid}, ${title}) RETURNING id, title, created_at, updated_at`;
    return NextResponse.json({ chat: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Recent chats POST error:", error);
    const message = error instanceof Error ? error.message : "Unable to create chat.";
    return NextResponse.json({ error: message, code: isAuthError(message) ? "AUTH_ERROR" : "DATABASE_ERROR" }, { status: isAuthError(message) ? 401 : 503 });
  }
}
