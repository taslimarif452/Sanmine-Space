import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { runProductionMigrations } from "@/lib/db/migrations";
import { auditWebsite, scoreLead } from "@/lib/intelligence/lead-intelligence";
import { AppError, errorResponse, errorStatus } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { z } from "zod";

const Body=z.object({url:z.string().url().max(2000).optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{const user=await getRequestUser(request);await runProductionMigrations();await enforceRateLimit(`lead:audit:${user.uid}`,20,60_000);const {id}=await params;const parsed=Body.safeParse(await request.json().catch(()=>({})));if(!parsed.success)throw new AppError("VALIDATION_ERROR","Invalid website URL.",400);const rows=await sql`SELECT * FROM leads WHERE id=${id} AND user_id=${user.uid} LIMIT 1`;const lead=rows[0] as any;if(!lead)throw new AppError("NOT_FOUND","Lead not found.",404);const url=parsed.data.url||lead.website_url;if(!url)throw new AppError("VALIDATION_ERROR","This lead has no website URL to audit.",400);const audit=await auditWebsite(url);const saved=await sql`INSERT INTO website_audits(user_id,lead_id,url,score,findings) VALUES(${user.uid},${id},${audit.url},${audit.score},${JSON.stringify(audit)}) RETURNING *`;const ranking=scoreLead({subscribers:Number(lead.subscribers||0),totalViews:Number(lead.total_views||0),websiteVerified:true,websiteScore:audit.score,contactConfidence:Number(lead.contact_confidence||0),hasEmail:Boolean(lead.email),hasYoutube:Boolean(lead.youtube_url)});await sql`UPDATE leads SET website_verified=TRUE,website_status=200,website_verified_at=NOW(),website_final_url=${audit.url},website_title=${audit.title||null},website_description=${audit.metaDescription||null},lead_score=${ranking.score},score_reasons=${JSON.stringify(ranking.reasons)},updated_at=NOW(),last_researched_at=NOW() WHERE id=${id} AND user_id=${user.uid}`;return NextResponse.json({audit:saved[0],ranking});}catch(error){return NextResponse.json(errorResponse(error,"Unable to audit website."),{status:errorStatus(error)});}
}
