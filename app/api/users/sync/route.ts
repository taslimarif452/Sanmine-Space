import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { hasDatabaseConfig, sql } from "@/lib/db/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureUsersTable() {
  await sql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, image TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
}

function isAuthError(message: string) {
  return /authentication|auth|token|credential|unauthorized|missing authentication|firebase/i.test(message);
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);

    if (!hasDatabaseConfig()) {
      return NextResponse.json({ user, persistence: "unavailable", warning: "Neon DATABASE_URL is not configured." });
    }

    await ensureUsersTable();
    const rows = await sql`
      INSERT INTO users (id, email, name, image)
      VALUES (${user.uid}, ${user.email ?? `${user.uid}@unknown.local`}, ${user.name ?? null}, ${user.picture ?? null})
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        image = EXCLUDED.image,
        updated_at = NOW()
      RETURNING id, email, name, image
    `;

    return NextResponse.json({ user: rows[0], persistence: "saved" });
  } catch (error) {
    console.error("User sync error:", error);
    const message = error instanceof Error ? error.message : "Unable to sync user.";
    return NextResponse.json(
      { error: message, code: isAuthError(message) ? "AUTH_ERROR" : "DATABASE_ERROR" },
      { status: isAuthError(message) ? 401 : 503 },
    );
  }
}
