import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";

async function ensureTable() {
  await sql`CREATE TABLE IF NOT EXISTS email_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google','microsoft')),
    provider_account_id TEXT,
    email TEXT NOT NULL,
    display_name TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider, email)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS email_connections_user_idx ON email_connections(user_id, updated_at DESC)`;
}

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureTable();
    const rows = await sql`SELECT id, provider, email, display_name, expires_at, created_at, updated_at FROM email_connections WHERE user_id = ${user.uid} ORDER BY updated_at DESC`;
    return NextResponse.json({ connections: rows });
  } catch (error) {
    console.error("Email connections GET failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load email connections." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getRequestUser(request);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "Connection id is required." }, { status: 400 });
    await ensureTable();
    const result = await sql`DELETE FROM email_connections WHERE id = ${id} AND user_id = ${user.uid}`;
    return NextResponse.json({ ok: true, deleted: result.length > 0 });
  } catch (error) {
    console.error("Email connection DELETE failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to disconnect email." }, { status: 500 });
  }
}
