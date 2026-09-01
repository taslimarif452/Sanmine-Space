import { sql } from "@/lib/db/neon";
import { sendGmailMessage } from "@/lib/email/gmail";

export async function ensureCampaignTables() {
  await sql`CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES email_connections(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
    start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    interval_minutes INTEGER NOT NULL DEFAULT 60 CHECK (interval_minutes >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS email_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES email_connections(id) ON DELETE CASCADE,
    campaign_id UUID,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','sending','sent','failed')),
    scheduled_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    provider_message_id TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS email_approvals_user_status_idx ON email_approvals(user_id, status, scheduled_at ASC)`;
  await sql`CREATE INDEX IF NOT EXISTS email_approvals_campaign_idx ON email_approvals(campaign_id, scheduled_at ASC)`;
  await sql`CREATE INDEX IF NOT EXISTS campaigns_user_status_idx ON campaigns(user_id, status, updated_at DESC)`;
}

export async function sendApproval(id: string, userId: string) {
  const rows = await sql`SELECT id, user_id, connection_id, recipient, subject, body, status FROM email_approvals WHERE id=${id} AND user_id=${userId} LIMIT 1`;
  const approval = rows[0] as any;
  if (!approval) throw new Error("Approval not found.");
  if (approval.status !== "approved" && approval.status !== "sending") throw new Error("This email must be approved before it can be sent.");
  await sql`UPDATE email_approvals SET status='sending', error=NULL, updated_at=NOW() WHERE id=${id} AND user_id=${userId}`;
  try {
    const result = await sendGmailMessage(userId, String(approval.connection_id), { to: String(approval.recipient), subject: String(approval.subject), body: String(approval.body) });
    await sql`UPDATE email_approvals SET status='sent', sent_at=NOW(), provider_message_id=${result.id || null}, updated_at=NOW() WHERE id=${id} AND user_id=${userId}`;
    return { ...result, approvalId: id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed.";
    await sql`UPDATE email_approvals SET status='failed', error=${message}, updated_at=NOW() WHERE id=${id} AND user_id=${userId}`;
    throw error;
  }
}
