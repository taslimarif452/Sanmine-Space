import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    const rows = await sql`INSERT INTO users (id, email, name, image) VALUES (${user.uid}, ${user.email ?? ""}, ${user.name ?? null}, ${user.picture ?? null}) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, image = EXCLUDED.image, updated_at = NOW() RETURNING id, email, name, image`;
    return NextResponse.json({ user: rows[0] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 });
  }
}
