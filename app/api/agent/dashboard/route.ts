import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { dashboardMetrics } from "@/lib/agent/phase4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    return NextResponse.json(await dashboardMetrics(user.uid));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load agent dashboard." }, { status: 401 });
  }
}
