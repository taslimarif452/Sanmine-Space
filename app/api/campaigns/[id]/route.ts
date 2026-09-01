import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { ensureCampaignTables } from "@/lib/email/campaigns";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request);
    await ensureCampaignTables();
    const { id } = await context.params;
    const body = await request.json();
    const action = String(body.action || "");
    if (!["activate", "pause", "resume"].includes(action)) return NextResponse.json({ error: "Invalid campaign action." }, { status: 400 });
    const status = action === "activate" || action === "resume" ? "active" : "paused";
    const rows = await sql`UPDATE campaigns SET status=${status}, updated_at=NOW() WHERE id=${id} AND user_id=${user.uid} RETURNING *`;
    if (!rows[0]) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    return NextResponse.json({ campaign: rows[0] });
  } catch (error) {
    console.error("Campaign action failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update campaign." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request);
    await ensureCampaignTables();
    const { id } = await context.params;
    await sql`DELETE FROM email_approvals WHERE campaign_id=${id} AND user_id=${user.uid}`;
    const rows = await sql`DELETE FROM campaigns WHERE id=${id} AND user_id=${user.uid} RETURNING id`;
    if (!rows[0]) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Campaign DELETE failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete campaign." }, { status: 500 });
  }
}
