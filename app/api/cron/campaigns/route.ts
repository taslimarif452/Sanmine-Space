import { NextResponse } from "next/server";
import { sql } from "@/lib/db/neon";
import { ensureCampaignTables, recoverStaleSending, sendApproval } from "@/lib/email/campaigns";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Cron worker is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureCampaignTables();
    const recovered = await recoverStaleSending();
    const due = await sql`
      SELECT a.id, a.user_id
      FROM email_approvals a
      LEFT JOIN campaigns c ON c.id = a.campaign_id
      WHERE a.status = 'approved'
        AND (a.scheduled_at IS NULL OR a.scheduled_at <= NOW())
        AND (a.campaign_id IS NULL OR c.status = 'active')
      ORDER BY COALESCE(a.scheduled_at, a.created_at) ASC
      LIMIT 20
    `;

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const row of due as Array<{ id: string; user_id: string }>) {
      try {
        const sent = await sendApproval(String(row.id), String(row.user_id));
        if (sent.approvalId) {
          const approval = (await sql`SELECT campaign_id, recipient FROM email_approvals WHERE id = ${row.id}`)[0] as { campaign_id?: string; recipient: string } | undefined;
          if (approval?.campaign_id) {
            const next = (await sql`
              SELECT s.*
              FROM campaign_steps s
              JOIN campaign_contacts cc ON cc.campaign_id = s.campaign_id AND lower(cc.recipient) = lower(${approval.recipient})
              WHERE s.campaign_id = ${approval.campaign_id}
                AND s.step_order = (cc.current_step + 1)
              LIMIT 1
            `)[0] as { step_order: number; delay_minutes: number; subject: string; body: string } | undefined;

            if (next) {
              const scheduled = new Date(Date.now() + Number(next.delay_minutes || 0) * 60_000);
              await sql`
                INSERT INTO email_approvals(user_id, connection_id, campaign_id, recipient, subject, body, status, scheduled_at, idempotency_key)
                SELECT c.user_id, c.connection_id, c.id, ${approval.recipient}, ${next.subject}, ${next.body}, 'pending', ${scheduled.toISOString()},
                       md5(c.id::text || ':' || ${approval.recipient} || ':' || ${next.step_order})
                FROM campaigns c
                WHERE c.id = ${approval.campaign_id}
                ON CONFLICT(idempotency_key) DO NOTHING
              `;
              await sql`
                UPDATE campaign_contacts
                SET current_step = current_step + 1, next_step_at = ${scheduled.toISOString()}, updated_at = NOW()
                WHERE campaign_id = ${approval.campaign_id} AND lower(recipient) = lower(${approval.recipient})
              `;
            } else {
              await sql`
                UPDATE campaign_contacts SET state = 'completed', updated_at = NOW()
                WHERE campaign_id = ${approval.campaign_id} AND lower(recipient) = lower(${approval.recipient})
              `;
            }
          }
        }
        results.push({ id: String(row.id), ok: true });
      } catch (error) {
        results.push({ id: String(row.id), ok: false, error: error instanceof Error ? error.message : "Send failed." });
      }
    }

    await sql`
      UPDATE campaigns c
      SET status = 'completed', updated_at = NOW()
      WHERE c.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM email_approvals a
          WHERE a.campaign_id = c.id
            AND a.status IN ('pending', 'approved', 'sending', 'send_unknown')
        )
    `;
    return NextResponse.json({ ok: true, recovered, processed: results.length, results, ranAt: new Date().toISOString() });
  } catch (error) {
    console.error("Campaign cron failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign worker failed." }, { status: 500 });
  }
}
