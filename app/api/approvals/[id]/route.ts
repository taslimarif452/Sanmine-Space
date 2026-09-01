import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { ensureCampaignTables, sendApproval } from "@/lib/email/campaigns";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request);
    await ensureCampaignTables();
    const { id } = await context.params;
    const body = await request.json();
    const action = String(body.action || "");
    if (!id || !["approve", "reject", "send"].includes(action)) return NextResponse.json({ error: "Invalid approval action." }, { status: 400 });
    if (action === "send") {
      const result = await sendApproval(id, user.uid);
      return NextResponse.json({ ok: true, result });
    }
    if (action === "approve") {
      const rows = await sql`UPDATE email_approvals SET status='approved', approved_at=NOW(), error=NULL, updated_at=NOW() WHERE id=${id} AND user_id=${user.uid} AND status='pending' RETURNING *`;
      if (!rows[0]) return NextResponse.json({ error: "Approval is no longer pending." }, { status: 409 });
      return NextResponse.json({ approval: rows[0] });
    }
    const rows = await sql`UPDATE email_approvals SET status='rejected', updated_at=NOW() WHERE id=${id} AND user_id=${user.uid} AND status IN ('pending','approved') RETURNING *`;
    if (!rows[0]) return NextResponse.json({ error: "Approval cannot be rejected in its current state." }, { status: 409 });
    return NextResponse.json({ approval: rows[0] });
  } catch (error) {
    console.error("Approval action failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update approval." }, { status: 500 });
  }
}
