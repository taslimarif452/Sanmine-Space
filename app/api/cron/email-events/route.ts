import { NextResponse } from "next/server";
import { sql } from "@/lib/db/neon";
import { runProductionMigrations } from "@/lib/db/migrations";
import { syncGmailEvents } from "@/lib/email/gmail-sync";
export const dynamic="force-dynamic";
export async function GET(request:Request){const secret=process.env.CRON_SECRET?.trim();if(!secret)return NextResponse.json({error:"Cron worker is not configured."},{status:503});if(request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});try{await runProductionMigrations();const users=await sql`SELECT DISTINCT user_id FROM email_connections WHERE provider='google'`;let detected=0;for(const row of users as any[])detected+=await syncGmailEvents(String(row.user_id),25);return NextResponse.json({ok:true,detected,ranAt:new Date().toISOString()});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Email event sync failed."},{status:500});}}
