import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { ensureCampaignTables } from "@/lib/email/campaigns";
import { AppError, errorResponse, errorStatus } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { z } from "zod";

const BulkApprovalSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(["approve", "reject"]),
});

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureCampaignTables();
    await enforceRateLimit(`approval:bulk:${user.uid}`, 30, 60_000);
    const parsed = BulkApprovalSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Select valid approvals and an action.", 400);
    const ids = [...new Set(parsed.data.ids)];
    const status = parsed.data.action === "approve" ? "approved" : "rejected";
    const rows = await sql`
      UPDATE email_approvals
      SET status=${status}, approved_at=CASE WHEN ${status}='approved' THEN NOW() ELSE approved_at END, error=NULL, updated_at=NOW()
      WHERE user_id=${user.uid} AND id=ANY(${ids}::uuid[]) AND status='pending'
      RETURNING id
    `;
    return NextResponse.json({ ok: true, action: parsed.data.action, updated: rows.length, ids: rows.map((r) => String(r.id)) });
  } catch (error) {
    console.error("Bulk approval action failed", error);
    return NextResponse.json(errorResponse(error, "Unable to update approvals."), { status: errorStatus(error) });
  }
}
