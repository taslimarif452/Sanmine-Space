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
    await enforceRateLimit(`research:leads:${user.uid}`, 60, 60_000);
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
    const leads = await sql`SELECT id, name, email, website_url, website_verified, website_status, website_verified_at, website_final_url, country, niche, youtube_channel_id, youtube_url, subscribers, total_views, contact_confidence, lead_score, score_reasons, first_seen_at, last_researched_at FROM leads WHERE user_id=${user.uid} ORDER BY lead_score DESC, last_researched_at DESC LIMIT ${limit}`;
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("Research leads GET failed", error);
    return NextResponse.json(errorResponse(error, "Unable to load research leads."), { status: errorStatus(error) });
  }
}
