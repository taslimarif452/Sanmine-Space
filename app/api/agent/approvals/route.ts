import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { createApproval, resolveApproval, ensureProductionSchema } from "@/lib/agent/production";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureProductionSchema();
    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action.trim() : "";
    if (!action) return NextResponse.json({ error: "Approval action is required." }, { status: 400 });
    if (action !== "send_email" && action !== "send_proposal_outreach") return NextResponse.json({ error: "This action is not approval-gated." }, { status: 400 });
    const approval = await createApproval(user.uid, typeof body?.runId === "string" ? body.runId : null, action, body?.payload && typeof body.payload === "object" ? body.payload : {});
    return NextResponse.json({ approval }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create approval." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureProductionSchema();
    const body = await request.json();
    if (typeof body?.approvalId !== "string") return NextResponse.json({ error: "approvalId is required." }, { status: 400 });
    if (body?.decision !== "approved" && body?.decision !== "rejected") return NextResponse.json({ error: "decision must be approved or rejected." }, { status: 400 });
    const approval = await resolveApproval(user.uid, body.approvalId, body.decision, typeof body?.note === "string" ? body.note : undefined);
    return NextResponse.json({ approval });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not resolve approval." }, { status: 500 });
  }
}
