import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { ensureCampaignTables, sendApproval } from "@/lib/email/campaigns";
import { ApprovalActionSchema } from "@/lib/api/schemas";
import { AppError, errorResponse, errorStatus } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request);
    await ensureCampaignTables();
    await enforceRateLimit(`approval:write:${user.uid}`, 60, 60_000);
    const { id } = await context.params;
    if (!id) throw new AppError("VALIDATION_ERROR", "Approval id is required.", 400);
    const parsed = ApprovalActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", parsed.error.issues[0]?.message || "Invalid approval action.", 400);
    const { action } = parsed.data;

    if (action === "send" || action === "retry") {
      const result = await sendApproval(id, user.uid);
      return NextResponse.json({ ok: true, result });
    }
    if (action === "approve") {
      const rows = await sql`UPDATE email_approvals SET status='approved', approved_at=NOW(), error=NULL, updated_at=NOW() WHERE id=${id} AND user_id=${user.uid} AND status='pending' RETURNING *`;
      if (!rows[0]) throw new AppError("CONFLICT", "Approval is no longer pending.", 409);
      return NextResponse.json({ approval: rows[0] });
    }
    const rows = await sql`UPDATE email_approvals SET status='rejected', updated_at=NOW() WHERE id=${id} AND user_id=${user.uid} AND status IN ('pending','approved') RETURNING *`;
    if (!rows[0]) throw new AppError("CONFLICT", "Approval cannot be rejected in its current state.", 409);
    return NextResponse.json({ approval: rows[0] });
  } catch (error) {
    console.error("Approval action failed", error);
    return NextResponse.json(errorResponse(error, "Unable to update approval."), { status: errorStatus(error) });
  }
}
