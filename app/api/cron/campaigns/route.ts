import { NextResponse } from "next/server";
import { sql } from "@/lib/db/neon";
import { ensureCampaignTables, recoverStaleSending, sendApproval } from "@/lib/email/campaigns";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Cron worker is not configured." }, { status: 503 });
  const authorization = request.headers.get("authorization") || "";
  if (authorization !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureCampaignTables();
    const recovered = await recoverStaleSending();
    const due = await sql`
      SELECT a.id, a.user_id
      FROM email_approvals a
      LEFT JOIN campaigns c ON c.id=a.campaign_id
      WHERE a.status='approved'
        AND (a.scheduled_at IS NULL OR a.scheduled_at <= NOW())
        AND (a.campaign_id IS NULL OR c.status='active')
      ORDER BY COALESCE(a.scheduled_at, a.created_at) ASC
      LIMIT 20
      FOR UPDATE SKIP LOCKED
    `;
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const row of due as Array<{ id: string; user_id: string }>) {
      try {
        await sendApproval(String(row.id), String(row.user_id));
        results.push({ id: String(row.id), ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Send failed.";
        results.push({ id: String(row.id), ok: false, error: message });
      }
    }
    await sql`UPDATE campaigns c SET status='completed', updated_at=NOW() WHERE c.status='active' AND NOT EXISTS (SELECT 1 FROM email_approvals a WHERE a.campaign_id=c.id AND a.status IN ('pending','approved','sending','send_unknown'))`;
    return NextResponse.json({ ok: true, recovered, processed: results.length, results, ranAt: new Date().toISOString() });
  } catch (error) {
    console.error("Campaign cron failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign worker failed." }, { status: 500 });
  }
}
