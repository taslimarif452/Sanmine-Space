import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { ensureCampaignTables } from "@/lib/email/campaigns";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export async function GET(request: Request) {
  const user = await getRequestUser(request); await ensureCampaignTables(); await enforceRateLimit(`campaign:analytics:${user.uid}`, 60, 60_000);
  const campaigns = await sql`
    SELECT c.id,c.name,c.status,c.created_at,
      COUNT(a.id)::int AS total,
      COUNT(a.id) FILTER (WHERE a.status='sent')::int AS sent,
      COUNT(a.id) FILTER (WHERE a.status='failed')::int AS failed,
      COUNT(a.id) FILTER (WHERE a.status='send_unknown')::int AS unknown,
      COUNT(a.id) FILTER (WHERE a.status IN ('pending','approved','sending'))::int AS pending,
      COUNT(e.id) FILTER (WHERE e.event_type='replied')::int AS replies,
      COUNT(e.id) FILTER (WHERE e.event_type='bounced')::int AS bounces
    FROM campaigns c LEFT JOIN email_approvals a ON a.campaign_id=c.id LEFT JOIN email_events e ON e.campaign_id=c.id
    WHERE c.user_id=${user.uid} GROUP BY c.id ORDER BY c.created_at DESC`;
  return NextResponse.json({ campaigns });
}
