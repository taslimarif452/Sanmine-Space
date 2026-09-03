// Production runtime primitives: durable run state, telemetry, cost estimates,
// provider health, routing policy, approvals, and resumable background jobs.
import { sql, hasDatabaseConfig } from "@/lib/db/neon";
import { ensurePhase4Schema } from "@/lib/agent/phase4";

export type AgentRunStatus = "running" | "completed" | "failed" | "cancelled";
export type AgentRunKind = "chat" | "research" | "tool_test" | "background_research";

export type RunContext = {
  runId: string;
  startedAt: number;
  userId: string;
  kind: AgentRunKind;
  model?: string;
  provider?: string;
};

export type CostEstimate = { inputTokens: number; outputTokens: number; inputCostUsd: number; outputCostUsd: number; totalCostUsd: number };
const DEFAULT_BUDGET_USD = Number(process.env.AI_RUN_BUDGET_USD || "0.25");
const MAX_RUN_MS = Number(process.env.AI_RUN_MAX_MS || "120000");
const MAX_TOOL_CALLS = Number(process.env.AI_MAX_TOOL_CALLS || "12");
const MAX_STEPS = Number(process.env.AI_MAX_STEPS || "8");

export function createRunContext(userId: string, kind: AgentRunKind, provider?: string, model?: string): RunContext { return { runId: crypto.randomUUID(), startedAt: Date.now(), userId, kind, provider, model }; }
export function getRunLimits() { return { maxRunMs: MAX_RUN_MS, maxToolCalls: MAX_TOOL_CALLS, maxSteps: MAX_STEPS, budgetUsd: DEFAULT_BUDGET_USD }; }
export function assertRunBudget(ctx: RunContext, inputTokens = 0, outputTokens = 0, estimatedCostUsd = 0) { const limits = getRunLimits(); if (Date.now()-ctx.startedAt > limits.maxRunMs) throw new Error(`Agent run timed out after ${Math.ceil(limits.maxRunMs/1000)}s.`); if (estimatedCostUsd > limits.budgetUsd) throw new Error("Agent run stopped after reaching its configured cost budget."); if (inputTokens+outputTokens < 0) throw new Error("Invalid token usage."); }
export function estimateTokens(text: string): number { return Math.max(0,Math.ceil(String(text||"").length/4)); }
export function estimateCost(provider: string, model: string, inputTokens: number, outputTokens: number): CostEstimate { const p=provider.toLowerCase(),m=model.toLowerCase(); const inputRate=Number(process.env.AI_INPUT_COST_PER_1M || (p==="openrouter"?"0.50":m.includes("flash")?"0.30":"1.00")); const outputRate=Number(process.env.AI_OUTPUT_COST_PER_1M || (p==="openrouter"?"2.00":m.includes("flash")?"2.50":"5.00")); const inputCostUsd=inputTokens/1_000_000*inputRate,outputCostUsd=outputTokens/1_000_000*outputRate; return {inputTokens,outputTokens,inputCostUsd,outputCostUsd,totalCostUsd:inputCostUsd+outputCostUsd}; }

export async function ensureProductionSchema() {
  if (!hasDatabaseConfig()) return;
  await sql`CREATE TABLE IF NOT EXISTS agent_runs (id UUID PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, provider TEXT, model TEXT, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0, step_count INTEGER NOT NULL DEFAULT 0, tool_call_count INTEGER NOT NULL DEFAULT 0, error TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ)`;
  await sql`CREATE TABLE IF NOT EXISTS agent_steps (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE, step_order INTEGER NOT NULL, type TEXT NOT NULL, name TEXT, status TEXT NOT NULL, duration_ms INTEGER, tool_call_id TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(run_id, step_order))`;
  await sql`CREATE TABLE IF NOT EXISTS ai_usage (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL, user_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS provider_health (provider TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'unknown', consecutive_failures INTEGER NOT NULL DEFAULT 0, last_error TEXT, last_latency_ms INTEGER, last_checked_at TIMESTAMPTZ)`;
  await sql`CREATE TABLE IF NOT EXISTS agent_approvals (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_id UUID REFERENCES agent_runs(id) ON DELETE CASCADE, user_id TEXT NOT NULL, action TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ, resolution_note TEXT)`;
  await sql`CREATE TABLE IF NOT EXISTS background_jobs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL, user_id TEXT NOT NULL, type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), locked_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS agent_runs_user_started_idx ON agent_runs(user_id, started_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS agent_steps_run_order_idx ON agent_steps(run_id, step_order)`;
  await sql`CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON ai_usage(user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS background_jobs_due_idx ON background_jobs(status, available_at)`;
  await ensurePhase4Schema();
}

export async function startRun(ctx: RunContext, metadata: Record<string, unknown> = {}) { if (!hasDatabaseConfig()) return; await sql`INSERT INTO agent_runs (id,user_id,kind,status,provider,model,metadata) VALUES (${ctx.runId},${ctx.userId},${ctx.kind},'running',${ctx.provider||null},${ctx.model||null},${JSON.stringify(metadata)}::jsonb)`; }
export async function recordStep(ctx: RunContext, stepOrder: number, type: string, name: string, status: string, durationMs?: number, toolCallId?: string, metadata: Record<string, unknown> = {}) { if (!hasDatabaseConfig()) return; await sql`INSERT INTO agent_steps (run_id,step_order,type,name,status,duration_ms,tool_call_id,metadata) VALUES (${ctx.runId},${stepOrder},${type},${name},${status},${durationMs||null},${toolCallId||null},${JSON.stringify(metadata)}::jsonb) ON CONFLICT (run_id,step_order) DO UPDATE SET status=EXCLUDED.status,duration_ms=EXCLUDED.duration_ms,metadata=EXCLUDED.metadata`; }
export async function recordUsage(ctx: RunContext, usage: CostEstimate) { if (!hasDatabaseConfig()||!ctx.provider||!ctx.model) return; await sql`INSERT INTO ai_usage (run_id,user_id,provider,model,input_tokens,output_tokens,estimated_cost_usd) VALUES (${ctx.runId},${ctx.userId},${ctx.provider},${ctx.model},${usage.inputTokens},${usage.outputTokens},${usage.totalCostUsd})`; await sql`UPDATE agent_runs SET input_tokens=input_tokens+${usage.inputTokens},output_tokens=output_tokens+${usage.outputTokens},estimated_cost_usd=estimated_cost_usd+${usage.totalCostUsd} WHERE id=${ctx.runId}`; }
export async function finishRun(ctx: RunContext, status: AgentRunStatus, metadata: Record<string, unknown> = {}, error?: string) { if (!hasDatabaseConfig()) return; await sql`UPDATE agent_runs SET status=${status},error=${error||null},metadata=metadata || ${JSON.stringify(metadata)}::jsonb,completed_at=NOW() WHERE id=${ctx.runId}`; }
export async function recordProviderResult(provider: string, ok: boolean, latencyMs: number, error?: string) { if (!hasDatabaseConfig()) return; if(ok) await sql`INSERT INTO provider_health(provider,status,consecutive_failures,last_latency_ms,last_checked_at) VALUES (${provider},'healthy',0,${latencyMs},NOW()) ON CONFLICT(provider) DO UPDATE SET status='healthy',consecutive_failures=0,last_error=NULL,last_latency_ms=${latencyMs},last_checked_at=NOW()`; else await sql`INSERT INTO provider_health(provider,status,consecutive_failures,last_error,last_latency_ms,last_checked_at) VALUES (${provider},'degraded',1,${error||'provider error'},${latencyMs},NOW()) ON CONFLICT(provider) DO UPDATE SET status=CASE WHEN provider_health.consecutive_failures+1>=3 THEN 'unhealthy' ELSE 'degraded' END,consecutive_failures=provider_health.consecutive_failures+1,last_error=${error||'provider error'},last_latency_ms=${latencyMs},last_checked_at=NOW()`; }
export function chooseModel(kind: AgentRunKind, complexity: "fast"|"balanced"|"deep"="balanced") { const env=kind==="research"||kind==="background_research"||complexity==="deep"?process.env.AI_DEEP_MODEL:complexity==="fast"?process.env.AI_FAST_MODEL:process.env.AI_BALANCED_MODEL; return env?.trim()||process.env.GEMINI_MODEL?.trim()||process.env.OPENROUTER_MODEL?.trim()||"default"; }
export async function createApproval(userId: string, runId: string|null, action: string, payload: Record<string,unknown>) { if(!hasDatabaseConfig()) throw new Error("Approval storage is not configured."); const rows=await sql`INSERT INTO agent_approvals(user_id,run_id,action,payload) VALUES (${userId},${runId},${action},${JSON.stringify(payload)}::jsonb) RETURNING id,status,action,created_at`; return rows[0]; }
export async function resolveApproval(userId:string,approvalId:string,decision:"approved"|"rejected",note?:string){ if(!hasDatabaseConfig()) throw new Error("Approval storage is not configured."); const rows=await sql`UPDATE agent_approvals SET status=${decision},resolved_at=NOW(),resolution_note=${note||null} WHERE id=${approvalId} AND user_id=${userId} AND status='pending' RETURNING id,status,action,resolved_at`; if(!rows[0]) throw new Error("Approval not found or already resolved."); return rows[0]; }
export async function enqueueBackgroundResearch(userId:string,payload:Record<string,unknown>,runId?:string){ if(!hasDatabaseConfig()) throw new Error("Background research requires database persistence."); const rows=await sql`INSERT INTO background_jobs(user_id,run_id,type,payload) VALUES (${userId},${runId||null},'research',${JSON.stringify(payload)}::jsonb) RETURNING id,status,available_at`; return rows[0]; }
export async function claimBackgroundJob(){ if(!hasDatabaseConfig()) return null; const rows=await sql`UPDATE background_jobs SET status='running',attempts=attempts+1,locked_at=NOW() WHERE id=(SELECT id FROM background_jobs WHERE status='queued' AND available_at<=NOW() AND attempts<max_attempts ORDER BY available_at ASC FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,run_id,user_id,type,payload,attempts,max_attempts`; return rows[0]||null; }
export async function completeBackgroundJob(id:string,ok:boolean,error?:string){ if(!hasDatabaseConfig()) return; await sql`UPDATE background_jobs SET status=${ok?"completed":"failed"},error=${error||null},completed_at=NOW() WHERE id=${id}`; }
export function recoveryDelay(attempt:number){ return Math.min(8000,500*2**Math.max(0,attempt-1)); }
export async function withFailureRecovery<T>(fn:()=>Promise<T>,attempts=2):Promise<T>{ let last:unknown; for(let i=1;i<=attempts;i++){try{return await fn();}catch(error){last=error;if(i<attempts) await new Promise(r=>setTimeout(r,recoveryDelay(i)));}} throw last instanceof Error?last:new Error("Operation failed after recovery attempts."); }
