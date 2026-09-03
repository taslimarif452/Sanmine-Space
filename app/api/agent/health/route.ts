import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { hasDatabaseConfig, sql } from "@/lib/db/neon";
import { ensureProductionSchema } from "@/lib/agent/production";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!hasDatabaseConfig()) return NextResponse.json({ providerHealth: [], usage: [] });
    await ensureProductionSchema();
    const [providers, usage] = await Promise.all([
      sql`SELECT provider,status,consecutive_failures,last_latency_ms,last_error,last_checked_at FROM provider_health ORDER BY provider`,
      sql`SELECT provider,model,COUNT(*)::int AS calls,SUM(input_tokens)::int AS input_tokens,SUM(output_tokens)::int AS output_tokens,SUM(estimated_cost_usd)::numeric AS estimated_cost_usd FROM ai_usage WHERE user_id=${user.uid} AND created_at > NOW() - INTERVAL '30 days' GROUP BY provider,model ORDER BY estimated_cost_usd DESC`,
    ]);
    return NextResponse.json({ providerHealth: providers, usage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load AI health." }, { status: 500 });
  }
}
