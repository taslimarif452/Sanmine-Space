import { sql } from "@/lib/db/neon";
import { sendGmailMessage } from "@/lib/email/gmail";
import { AppError } from "@/lib/api/errors";
import { runProductionMigrations } from "@/lib/db/migrations";

export async function ensureCampaignTables() {
  await runProductionMigrations();
}

export async function recoverStaleSending(staleAfterMs = 15 * 60_000) {
  await runProductionMigrations();
  const cutoff = new Date(Date.now() - staleAfterMs);
  const rows = await sql`
    UPDATE email_approvals
    SET status='failed',
        error='Recovered stale sending attempt; safe to retry.',
        updated_at=NOW()
    WHERE status='sending'
      AND sending_started_at IS NOT NULL
      AND sending_started_at < ${cutoff.toISOString()}
    RETURNING id
  `;
  return rows.length;
}

export async function sendApproval(id: string, userId: string) {
  await runProductionMigrations();
  const idempotencyKey = `approval:${id}`;
  const claimed = await sql`
    UPDATE email_approvals
    SET status='sending',
        error=NULL,
        sending_started_at=NOW(),
        send_attempts=send_attempts+1,
        idempotency_key=COALESCE(idempotency_key, ${idempotencyKey}),
        updated_at=NOW()
    WHERE id=${id}
      AND user_id=${userId}
      AND status IN ('approved','failed')
      AND NOT EXISTS (
        SELECT 1 FROM email_approvals x
        WHERE x.id=${id} AND x.status='sent'
      )
    RETURNING id, connection_id, recipient, subject, body, provider_message_id
  `;
  const approval = claimed[0] as { id: string; connection_id: string; recipient: string; subject: string; body: string; provider_message_id?: string | null } | undefined;
  if (!approval) throw new AppError("CONFLICT", "This email is already being sent, already sent, or has not been approved.", 409);

  try {
    const result = await sendGmailMessage(userId, String(approval.connection_id), {
      to: String(approval.recipient),
      subject: String(approval.subject),
      body: String(approval.body),
    });
    const finalized = await sql`
      UPDATE email_approvals
      SET status='sent', sent_at=COALESCE(sent_at, NOW()), provider_message_id=COALESCE(provider_message_id, ${result.id || null}), sending_started_at=NULL, updated_at=NOW()
      WHERE id=${id} AND user_id=${userId} AND status='sending'
      RETURNING id, provider_message_id
    `;
    return { ...result, approvalId: id, idempotent: finalized.length === 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed.";
    await sql`
      UPDATE email_approvals
      SET status='failed', error=${message}, sending_started_at=NULL, updated_at=NOW()
      WHERE id=${id} AND user_id=${userId} AND status='sending'
    `;
    throw error;
  }
}
