import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { ensureCampaignTables } from "@/lib/email/campaigns";
import { recordEmailEvent, type OutreachEvent } from "@/lib/email/outreach-events";

const allowed = new Set<OutreachEvent>(["delivered","opened","clicked","replied","bounced","unsubscribed"]);

export async function POST(request: Request) {
  const user = await getRequestUser(request); await ensureCampaignTables();
  const body = await request.json().catch(() => null);
  const eventType = body?.event_type as OutreachEvent;
  if (!allowed.has(eventType)) return NextResponse.json({ error: "Unsupported email event." }, { status: 400 });
  const result = await recordEmailEvent({ userId: user.uid, eventType, recipient: body?.recipient, campaignId: body?.campaign_id, approvalId: body?.approval_id, providerMessageId: body?.provider_message_id, providerThreadId: body?.provider_thread_id, metadata: typeof body?.metadata === "object" ? body.metadata : {} });
  return NextResponse.json({ ok: true, event: result });
}
