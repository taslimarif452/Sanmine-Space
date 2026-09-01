import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    const chats = await sql`SELECT id, title, created_at, updated_at FROM chats WHERE user_id = ${user.uid} ORDER BY updated_at DESC LIMIT 100`;
    return NextResponse.json({ chats });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    const body = await request.json();
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "New chat";
    const rows = await sql`INSERT INTO chats (user_id, title) VALUES (${user.uid}, ${title}) RETURNING id, title, created_at, updated_at`;
    return NextResponse.json({ chat: rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 });
  }
}
