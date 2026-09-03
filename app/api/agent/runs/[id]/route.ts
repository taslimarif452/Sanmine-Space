import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { ensureProductionSchema } from "@/lib/agent/production";
import { sql, hasDatabaseConfig } from "@/lib/db/neon";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request);
    if (!hasDatabaseConfig()) return NextResponse.json({ error: "Database persistence is not configured." }, { status: 503 });
    await ensureProductionSchema();
    const { id } = await context.params;
    const runs = await sql`SELECT id,kind,status,provider,model,input_tokens,output_tokens,estimated_cost_usd,step_count,tool_call_count,error,metadata,started_at,completed_at FROM agent_runs WHERE id=${id} AND user_id=${user.uid} LIMIT 1`;
    if (!runs[0]) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    const steps = await sql`SELECT step_order,type,name,status,duration_ms,tool_call_id,metadata,created_at FROM agent_steps WHERE run_id=${id} ORDER BY step_order ASC`;
    return NextResponse.json({ run: runs[0], steps });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load run status." }, { status: 500 });
  }
}
