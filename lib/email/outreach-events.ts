import { sql } from "@/lib/db/neon";

export type OutreachEvent = "sent" | "delivered" | "opened" | "clicked" | "replied" | "bounced" | "failed" | "unsubscribed";

export async function recordEmailEvent(input: {
  userId: string;
  eventType: OutreachEvent;
  recipient?: string | null;
  campaignId?: string | null;
  approvalId?: string | null;
  providerMessageId?: string | null;
  providerThreadId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const email = input.recipient?.trim().toLowerCase() || null;
  if ((input.eventType === "bounced" || input.eventType === "unsubscribed") && email) {
    await sql`INSERT INTO suppression_list (user_id, email, reason, source) VALUES (${input.userId}, ${email}, ${input.eventType}, 'provider') ON CONFLICT (user_id, email) DO UPDATE SET reason=EXCLUDED.reason`;
    await sql`UPDATE campaign_contacts SET state='suppressed', updated_at=NOW() WHERE campaign_id IS NOT DISTINCT FROM ${input.campaignId} AND recipient=${email}`;
  }
  if (input.eventType === "replied" && email) {
    await sql`UPDATE campaign_contacts SET state='replied', updated_at=NOW() WHERE campaign_id IS NOT DISTINCT FROM ${input.campaignId} AND recipient=${email}`;
  }
  const rows = await sql`INSERT INTO email_events (user_id, campaign_id, approval_id, recipient, event_type, provider_message_id, provider_thread_id, metadata) VALUES (${input.userId}, ${input.campaignId || null}, ${input.approvalId || null}, ${email}, ${input.eventType}, ${input.providerMessageId || null}, ${input.providerThreadId || null}, ${JSON.stringify(input.metadata || {})}) RETURNING id, occurred_at`;
  return rows[0];
}

export async function isSuppressed(userId: string, email: string) {
  const rows = await sql`SELECT 1 FROM suppression_list WHERE user_id=${userId} AND email=${email.trim().toLowerCase()} LIMIT 1`;
  return Boolean(rows[0]);
}
