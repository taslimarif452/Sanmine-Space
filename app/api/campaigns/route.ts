import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { runProductionMigrations } from "@/lib/db/migrations";
import { CreateCampaignSchema } from "@/lib/api/schemas";
import { AppError, errorResponse, errorStatus } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request); await runProductionMigrations(); await enforceRateLimit(`campaigns:get:${user.uid}`,60,60_000);
    const campaigns=await sql`SELECT c.*,COUNT(a.id)::int AS total,COUNT(a.id) FILTER (WHERE a.status='sent')::int AS sent,COUNT(a.id) FILTER (WHERE a.status='pending')::int AS pending,COUNT(a.id) FILTER (WHERE a.status='failed')::int AS failed FROM campaigns c LEFT JOIN email_approvals a ON a.campaign_id=c.id WHERE c.user_id=${user.uid} GROUP BY c.id ORDER BY c.updated_at DESC`;
    const approvals=await sql`SELECT a.*,c.name AS campaign_name,e.email AS sender_email FROM email_approvals a LEFT JOIN campaigns c ON c.id=a.campaign_id JOIN email_connections e ON e.id=a.connection_id WHERE a.user_id=${user.uid} ORDER BY a.created_at DESC LIMIT 100`;
    return NextResponse.json({campaigns,approvals});
  } catch(error){console.error("Campaigns GET failed",error);return NextResponse.json(errorResponse(error,"Unable to load campaigns."),{status:errorStatus(error)});}
}

export async function POST(request: Request) {
  try {
    const user=await getRequestUser(request);await runProductionMigrations();await enforceRateLimit(`campaigns:create:${user.uid}`,10,60*60_000);
    const parsed=CreateCampaignSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new AppError("VALIDATION_ERROR",parsed.error.issues[0]?.message||"Invalid campaign request.",400);
    const {name,connectionId,subject,body,recipients,intervalMinutes,startAt}=parsed.data;const start=startAt?new Date(startAt):new Date();const uniqueRecipients=[...new Set(recipients)];if(!uniqueRecipients.length)throw new AppError("VALIDATION_ERROR","At least one unique recipient is required.",400);
    const connections=await sql`SELECT id,provider FROM email_connections WHERE id=${connectionId} AND user_id=${user.uid} LIMIT 1`;if(!connections[0])throw new AppError("NOT_FOUND","Email connection not found.",404);if(connections[0].provider!=="google")throw new AppError("VALIDATION_ERROR","Only Gmail campaigns are enabled right now.",400);
    const suppressed=await sql`SELECT email FROM suppression_list WHERE user_id=${user.uid} AND email=ANY(${uniqueRecipients}::text[])`;const blocked=new Set(suppressed.map((r:any)=>String(r.email).toLowerCase()));const eligible=uniqueRecipients.filter(r=>!blocked.has(r));if(!eligible.length)throw new AppError("VALIDATION_ERROR","All selected recipients are on the suppression list.",400);
    const rows=await sql`WITH campaign AS (INSERT INTO campaigns(user_id,connection_id,name,subject,body,status,start_at,interval_minutes) VALUES(${user.uid},${connectionId},${name},${subject},${body},'draft',${start.toISOString()},${intervalMinutes}) RETURNING *), approvals AS (INSERT INTO email_approvals(user_id,connection_id,campaign_id,recipient,subject,body,scheduled_at,idempotency_key) SELECT ${user.uid},${connectionId},campaign.id,r.recipient,${subject},${body},campaign.start_at+((r.ordinality-1)*campaign.interval_minutes)*INTERVAL '1 minute',md5(campaign.id::text||':'||r.recipient) FROM campaign CROSS JOIN unnest(${eligible}::text[]) WITH ORDINALITY AS r(recipient,ordinality) RETURNING id), contacts AS (INSERT INTO campaign_contacts(campaign_id,recipient,current_step,next_step_at,state) SELECT campaign.id,r.recipient,1,campaign.start_at,'active' FROM campaign CROSS JOIN unnest(${eligible}::text[]) AS r(recipient) ON CONFLICT(campaign_id,recipient) DO NOTHING RETURNING id) SELECT * FROM campaign`;
    return NextResponse.json({campaign:rows[0],skipped_suppressed:uniqueRecipients.length-eligible.length},{status:201});
  }catch(error){console.error("Campaigns POST failed",error);return NextResponse.json(errorResponse(error,"Unable to create campaign."),{status:errorStatus(error)});}
}
