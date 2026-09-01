import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { ensureCampaignTables } from "@/lib/email/campaigns";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureCampaignTables();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const rows = status
      ? await sql`SELECT a.*, c.name AS campaign_name, e.email AS sender_email FROM email_approvals a LEFT JOIN campaigns c ON c.id=a.campaign_id JOIN email_connections e ON e.id=a.connection_id WHERE a.user_id=${user.uid} AND a.status=${status} ORDER BY a.created_at DESC LIMIT 100`
      : await sql`SELECT a.*, c.name AS campaign_name, e.email AS sender_email FROM email_approvals a LEFT JOIN campaigns c ON c.id=a.campaign_id JOIN email_connections e ON e.id=a.connection_id WHERE a.user_id=${user.uid} ORDER BY a.created_at DESC LIMIT 100`;
    return NextResponse.json({ approvals: rows });
  } catch (error) {
    console.error("Approvals GET failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load approvals." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureCampaignTables();
    const body = await request.json();
    const connectionId = String(body.connectionId || "");
    const recipient = String(body.recipient || "").trim();
    const subject = String(body.subject || "").trim();
    const content = String(body.body || "").trim();
    const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
    if (!connectionId || !recipient || !subject || !content) return NextResponse.json({ error: "connectionId, recipient, subject and body are required." }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(recipient)) return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Invalid scheduledAt." }, { status: 400 });
    const connections = await sql`SELECT id, provider FROM email_connections WHERE id=${connectionId} AND user_id=${user.uid} LIMIT 1`;
    if (!connections[0]) return NextResponse.json({ error: "Email connection not found." }, { status: 404 });
    if (connections[0].provider !== "google") return NextResponse.json({ error: "Only Gmail sending is enabled right now." }, { status: 400 });
    const rows = await sql`INSERT INTO email_approvals (user_id, connection_id, recipient, subject, body, scheduled_at) VALUES (${user.uid}, ${connectionId}, ${recipient}, ${subject}, ${content}, ${scheduledAt ? scheduledAt.toISOString() : null}) RETURNING *`;
    return NextResponse.json({ approval: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Approvals POST failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create approval." }, { status: 500 });
  }
}
