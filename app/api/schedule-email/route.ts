import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { ensureProductionSchema } from "@/lib/agent/production";
import { sql } from "@/lib/db/neon";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureProductionSchema();
    const rows = await sql`SELECT a.id,a.recipient,a.subject,a.body,a.scheduled_at,a.status,a.created_at,e.email AS sender_email FROM email_approvals a JOIN email_connections e ON e.id=a.connection_id WHERE a.user_id=${user.uid} AND a.scheduled_at IS NOT NULL AND a.sent_at IS NULL ORDER BY a.scheduled_at ASC LIMIT 200`;
    return NextResponse.json({ emails: rows });
  } catch (error) {
    console.error("Scheduled emails GET failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load scheduled emails." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureProductionSchema();
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "Scheduled email id is required." }, { status: 400 });
    const rows = await sql`DELETE FROM email_approvals WHERE id=${id} AND user_id=${user.uid} AND sent_at IS NULL AND scheduled_at IS NOT NULL RETURNING id`;
    if (!rows[0]) return NextResponse.json({ error: "Scheduled email not found or already processed." }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: rows[0].id });
  } catch (error) {
    console.error("Scheduled email DELETE failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to cancel scheduled email." }, { status: 500 });
  }
}
