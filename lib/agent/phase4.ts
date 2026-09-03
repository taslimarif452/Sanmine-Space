import { sql, hasDatabaseConfig } from "@/lib/db/neon";

export async function ensurePhase4Schema() {
  if (!hasDatabaseConfig()) return;
  await sql`CREATE TABLE IF NOT EXISTS user_preferences (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, settings JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS agent_memory (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, memory_type TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, confidence NUMERIC(5,2) NOT NULL DEFAULT 1, source TEXT, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id,memory_type,key))`;
  await sql`CREATE TABLE IF NOT EXISTS agent_evidence (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL, source_url TEXT NOT NULL, domain TEXT NOT NULL, title TEXT, excerpt TEXT, confidence NUMERIC(5,2) NOT NULL DEFAULT 0, retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), metadata JSONB NOT NULL DEFAULT '{}'::jsonb, UNIQUE(user_id,source_url))`;
  await sql`CREATE TABLE IF NOT EXISTS evidence_edges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, from_evidence_id UUID NOT NULL REFERENCES agent_evidence(id) ON DELETE CASCADE, to_evidence_id UUID NOT NULL REFERENCES agent_evidence(id) ON DELETE CASCADE, relation TEXT NOT NULL, confidence NUMERIC(5,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(from_evidence_id,to_evidence_id,relation))`;
  await sql`CREATE TABLE IF NOT EXISTS workflow_definitions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', trigger TEXT NOT NULL, steps JSONB NOT NULL DEFAULT '[]'::jsonb, status TEXT NOT NULL DEFAULT 'draft', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS workflow_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'queued', current_step INTEGER NOT NULL DEFAULT 0, context JSONB NOT NULL DEFAULT '{}'::jsonb, error TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS dashboard_snapshots (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, period_start TIMESTAMPTZ NOT NULL, period_end TIMESTAMPTZ NOT NULL, metrics JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id,period_start,period_end))`;
}

export type MemoryType = "fact" | "preference" | "goal" | "instruction" | "summary";
export async function remember(userId: string, type: MemoryType, key: string, value: string, confidence = 1) {
  if (!hasDatabaseConfig()) return null;
  const rows = await sql`INSERT INTO agent_memory(user_id,memory_type,key,value,confidence) VALUES (${userId},${type},${key},${value},${Math.max(0,Math.min(1,confidence))}) ON CONFLICT(user_id,memory_type,key) DO UPDATE SET value=EXCLUDED.value,confidence=EXCLUDED.confidence,updated_at=NOW() RETURNING id,memory_type,key,value,confidence`;
  return rows[0] || null;
}
export async function recall(userId: string, limit = 20) {
  if (!hasDatabaseConfig()) return [];
  return sql`SELECT id,memory_type,key,value,confidence FROM agent_memory WHERE user_id=${userId} AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY updated_at DESC LIMIT ${Math.max(1,Math.min(100,limit))}`;
}
export async function savePreferences(userId: string, settings: Record<string, unknown>) {
  if (!hasDatabaseConfig()) return null;
  const rows = await sql`INSERT INTO user_preferences(user_id,settings) VALUES (${userId},${JSON.stringify(settings)}::jsonb) ON CONFLICT(user_id) DO UPDATE SET settings=user_preferences.settings || EXCLUDED.settings,updated_at=NOW() RETURNING user_id,settings`;
  return rows[0] || null;
}
export async function addEvidence(userId: string, sourceUrl: string, title?: string, excerpt?: string, runId?: string, confidence = 0) {
  if (!hasDatabaseConfig()) return null;
  let url: URL;
  try { url = new URL(sourceUrl); } catch { throw new Error("Invalid source URL."); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only HTTP(S) evidence sources are allowed.");
  const rows = await sql`INSERT INTO agent_evidence(user_id,run_id,source_url,domain,title,excerpt,confidence) VALUES (${userId},${runId || null},${url.toString()},${url.hostname},${title || null},${excerpt?.slice(0,2000) || null},${Math.max(0,Math.min(1,confidence))}) ON CONFLICT(user_id,source_url) DO UPDATE SET title=COALESCE(EXCLUDED.title,agent_evidence.title),excerpt=COALESCE(EXCLUDED.excerpt,agent_evidence.excerpt),confidence=GREATEST(agent_evidence.confidence,EXCLUDED.confidence),retrieved_at=NOW() RETURNING id,source_url,domain,title,excerpt,confidence`;
  return rows[0] || null;
}
export async function linkEvidence(userId: string, fromId: string, toId: string, relation: string, confidence = 0) {
  if (!hasDatabaseConfig()) return null;
  const rows = await sql`INSERT INTO evidence_edges(user_id,from_evidence_id,to_evidence_id,relation,confidence) VALUES (${userId},${fromId},${toId},${relation},${Math.max(0,Math.min(1,confidence))}) ON CONFLICT(from_evidence_id,to_evidence_id,relation) DO UPDATE SET confidence=EXCLUDED.confidence RETURNING id`;
  return rows[0] || null;
}
export function scoreLead(input: { websiteVerified?: boolean; contactConfidence?: number; evidenceConfidence?: number; subscribers?: number }) {
  let score = input.websiteVerified ? 25 : 0;
  score += Math.max(0,Math.min(25,(input.contactConfidence || 0)*25));
  score += Math.max(0,Math.min(25,(input.evidenceConfidence || 0)*25));
  const subscribers = input.subscribers || 0;
  score += subscribers > 10000 ? 25 : subscribers > 1000 ? 15 : subscribers > 100 ? 5 : 0;
  return Math.round(Math.min(100,score)*100)/100;
}
export async function createWorkflowRun(userId: string, workflowId: string, context: Record<string, unknown> = {}) {
  if (!hasDatabaseConfig()) throw new Error("Workflow persistence is not configured.");
  const rows = await sql`INSERT INTO workflow_runs(workflow_id,user_id,context) VALUES (${workflowId},${userId},${JSON.stringify(context)}::jsonb) RETURNING id,status,current_step,created_at`;
  return rows[0];
}
export async function updateWorkflowRun(userId: string, runId: string, status: string, currentStep: number, context: Record<string, unknown>, error?: string) {
  if (!hasDatabaseConfig()) return null;
  const rows = await sql`UPDATE workflow_runs SET status=${status},current_step=${currentStep},context=${JSON.stringify(context)}::jsonb,error=${error || null},started_at=CASE WHEN started_at IS NULL AND ${status}='running' THEN NOW() ELSE started_at END,completed_at=CASE WHEN ${status} IN ('completed','failed','cancelled') THEN NOW() ELSE completed_at END WHERE id=${runId} AND user_id=${userId} RETURNING id,status,current_step,context,error`;
  return rows[0] || null;
}
export async function dashboardMetrics(userId: string) {
  if (!hasDatabaseConfig()) return { runs: 0, successfulRuns: 0, researchRuns: 0, estimatedCostUsd: 0, pendingApprovals: 0, activeCampaigns: 0, leads: 0 };
  const [runs,cost,approvals,campaigns,leads] = await Promise.all([
    sql`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='completed')::int successful,COUNT(*) FILTER(WHERE kind IN ('research','background_research'))::int research FROM agent_runs WHERE user_id=${userId}`,
    sql`SELECT COALESCE(SUM(estimated_cost_usd),0)::float cost FROM ai_usage WHERE user_id=${userId}`,
    sql`SELECT COUNT(*)::int count FROM agent_approvals WHERE user_id=${userId} AND status='pending'`,
    sql`SELECT COUNT(*)::int count FROM campaigns WHERE user_id=${userId} AND status='active'`,
    sql`SELECT COUNT(*)::int count FROM leads WHERE user_id=${userId}`,
  ]);
  return { runs:runs[0]?.total||0,successfulRuns:runs[0]?.successful||0,researchRuns:runs[0]?.research||0,estimatedCostUsd:cost[0]?.cost||0,pendingApprovals:approvals[0]?.count||0,activeCampaigns:campaigns[0]?.count||0,leads:leads[0]?.count||0 };
}
