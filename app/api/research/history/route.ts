import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { runProductionMigrations } from "@/lib/db/migrations";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { errorResponse, errorStatus } from "@/lib/api/errors";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    await runProductionMigrations();
    await enforceRateLimit(`research:history:${user.uid}`, 60, 60_000);
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
    const runs = await sql`SELECT r.id, r.query, r.source, r.status, r.result_count, r.metadata, r.created_at, r.completed_at, COALESCE(json_agg(json_build_object('id', l.id, 'name', l.name, 'email', l.email, 'website_url', l.website_url, 'website_verified', l.website_verified, 'contact_confidence', l.contact_confidence, 'lead_score', l.lead_score) ORDER BY rl.rank) FILTER (WHERE l.id IS NOT NULL), '[]'::json) AS leads FROM research_runs r LEFT JOIN research_leads rl ON rl.research_run_id=r.id LEFT JOIN leads l ON l.id=rl.lead_id WHERE r.user_id=${user.uid} GROUP BY r.id ORDER BY r.created_at DESC LIMIT ${limit}`;
    return NextResponse.json({ runs });
  } catch (error) {
    console.error("Research history GET failed", error);
    return NextResponse.json(errorResponse(error, "Unable to load research history."), { status: errorStatus(error) });
  }
}
