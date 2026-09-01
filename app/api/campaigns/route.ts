import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { ensureCampaignTables } from "@/lib/email/campaigns";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureCampaignTables();
    const campaigns = await sql`SELECT c.*, COUNT(a.id)::int AS total, COUNT(a.id) FILTER (WHERE a.status='sent')::int AS sent, COUNT(a.id) FILTER (WHERE a.status='pending')::int AS pending, COUNT(a.id) FILTER (WHERE a.status='failed')::int AS failed FROM campaigns c LEFT JOIN email_approvals a ON a.campaign_id=c.id WHERE c.user_id=${user.uid} GROUP BY c.id ORDER BY c.updated_at DESC`;
    const approvals = await sql`SELECT a.*, c.name AS campaign_name, e.email AS sender_email FROM email_approvals a LEFT JOIN campaigns c ON c.id=a.campaign_id JOIN email_connections e ON e.id=a.connection_id WHERE a.user_id=${user.uid} ORDER BY a.created_at DESC LIMIT 100`;
    return NextResponse.json({ campaigns, approvals });
  } catch (error) {
    console.error("Campaigns GET failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load campaigns." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureCampaignTables();
    const body = await request.json();
    const name = String(body.name || "").trim();
    const connectionId = String(body.connectionId || "");
    const subject = String(body.subject || "").trim();
    const content = String(body.body || "").trim();
    const recipients = Array.isArray(body.recipients) ? body.recipients.map((x: unknown) => String(x).trim().toLowerCase()).filter(Boolean) : [];
    const intervalMinutes = Math.max(60, Math.min(10080, Number(body.intervalMinutes || 60)));
    const start = body.startAt ? new Date(String(body.startAt)) : new Date();
    if (!name || !connectionId || !subject || !content || !recipients.length) return NextResponse.json({ error: "Name, Gmail connection, subject, body and at least one recipient are required." }, { status: 400 });
    if (Number.isNaN(start.getTime())) return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
    if (recipients.some((email: string) => !/^\S+@\S+\.\S+$/.test(email))) return NextResponse.json({ error: "Every recipient must be a valid email address." }, { status: 400 });
    const connections = await sql`SELECT id, provider FROM email_connections WHERE id=${connectionId} AND user_id=${user.uid} LIMIT 1`;
    if (!connections[0]) return NextResponse.json({ error: "Email connection not found." }, { status: 404 });
    if (connections[0].provider !== "google") return NextResponse.json({ error: "Only Gmail campaigns are enabled right now." }, { status: 400 });
    const campaignRows = await sql`INSERT INTO campaigns (user_id, connection_id, name, subject, body, status, start_at, interval_minutes) VALUES (${user.uid}, ${connectionId}, ${name}, ${subject}, ${content}, 'draft', ${start.toISOString()}, ${intervalMinutes}) RETURNING *`;
    const campaign = campaignRows[0];
    for (let i = 0; i < recipients.length; i += 1) {
      const scheduled = new Date(start.getTime() + i * intervalMinutes * 60_000);
      await sql`INSERT INTO email_approvals (user_id, connection_id, campaign_id, recipient, subject, body, scheduled_at) VALUES (${user.uid}, ${connectionId}, ${campaign.id}, ${recipients[i]}, ${subject}, ${content}, ${scheduled.toISOString()})`;
    }
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("Campaigns POST failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create campaign." }, { status: 500 });
  }
}
