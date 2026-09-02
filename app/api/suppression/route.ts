import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { ensureCampaignTables } from "@/lib/email/campaigns";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export async function GET(request: Request) {
  const user = await getRequestUser(request); await ensureCampaignTables(); await enforceRateLimit(`suppression:read:${user.uid}`, 60, 60_000);
  const rows = await sql`SELECT id,email,reason,source,created_at FROM suppression_list WHERE user_id=${user.uid} ORDER BY created_at DESC`;
  return NextResponse.json({ suppression: rows });
}

export async function POST(request: Request) {
  const user = await getRequestUser(request); await ensureCampaignTables(); await enforceRateLimit(`suppression:write:${user.uid}`, 60, 60_000);
  const body = await request.json().catch(() => null); const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 120) : "manual";
  const rows = await sql`INSERT INTO suppression_list (user_id,email,reason,source) VALUES (${user.uid},${email},${reason},'user') ON CONFLICT (user_id,email) DO UPDATE SET reason=EXCLUDED.reason RETURNING *`;
  return NextResponse.json({ suppression: rows[0] });
}

export async function DELETE(request: Request) {
  const user = await getRequestUser(request); await ensureCampaignTables(); await enforceRateLimit(`suppression:write:${user.uid}`, 60, 60_000);
  const body = await request.json().catch(() => null); const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  await sql`DELETE FROM suppression_list WHERE user_id=${user.uid} AND email=${email}`;
  return NextResponse.json({ ok: true });
}
