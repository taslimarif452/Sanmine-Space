import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { ensureCampaignTables } from "@/lib/email/campaigns";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureCampaignTables();

    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 100);

    // Only return messages created by Sanmine's outreach workflow and
    // successfully sent through an app email approval. This never reads the
    // user's Gmail mailbox, so unrelated Gmail messages cannot appear here.
    const rows = await sql`
      SELECT
        a.id,
        a.recipient,
        a.subject,
        a.body,
        a.sent_at,
        a.created_at,
        a.provider_message_id,
        c.name AS campaign_name,
        e.email AS sender_email
      FROM email_approvals a
      LEFT JOIN campaigns c ON c.id = a.campaign_id
      JOIN email_connections e ON e.id = a.connection_id
      WHERE a.user_id = ${user.uid}
        AND a.status = 'sent'
      ORDER BY COALESCE(a.sent_at, a.updated_at, a.created_at) DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({ emails: rows });
  } catch (error) {
    console.error("Emails GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load sent emails." },
      { status: 500 },
    );
  }
}
