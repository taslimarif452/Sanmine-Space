import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/agent";
import { withProviderTask } from "@/lib/ai/request-context";
import { claimBackgroundJob, completeBackgroundJob, ensureProductionSchema, recordProviderResult } from "@/lib/agent/production";
import { hasDatabaseConfig, sql } from "@/lib/db/neon";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureProductionSchema();
    const job = await claimBackgroundJob();
    if (!job) return NextResponse.json({ status: "idle" });
    const started = Date.now();
    const provider = (process.env.AI_PROVIDER || "gemini").trim().toLowerCase();
    const runId = job.run_id ? String(job.run_id) : null;
    try {
      const payload = job.payload && typeof job.payload === "object" ? job.payload as Record<string, unknown> : {};
      const query = typeof payload.query === "string" ? payload.query : "";
      const history = Array.isArray(payload.history) ? payload.history : [];
      const result = await withProviderTask("deep", () => runAgent(history as any, query, undefined, String(job.user_id)));
      if (hasDatabaseConfig() && runId) await sql`UPDATE agent_runs SET status='completed',metadata=metadata || ${JSON.stringify({ jobId: String(job.id), resultLength: result.response?.length || 0 })}::jsonb,completed_at=NOW() WHERE id=${runId}`;
      await completeBackgroundJob(String(job.id), true);
      await recordProviderResult(provider, true, Date.now() - started);
      return NextResponse.json({ status: "completed", jobId: job.id, runId, response: result.response });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background research failed.";
      const exhausted = Number(job.attempts) >= Number(job.max_attempts);
      if (hasDatabaseConfig() && runId) await sql`UPDATE agent_runs SET status=${exhausted ? "failed" : "running"},error=${message},completed_at=${exhausted ? new Date() : null} WHERE id=${runId}`;
      await completeBackgroundJob(String(job.id), exhausted, message);
      await recordProviderResult(provider, false, Date.now() - started, message);
      return NextResponse.json({ status: exhausted ? "failed" : "retrying", jobId: job.id, runId, error: message }, { status: exhausted ? 500 : 202 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Background worker failed." }, { status: 500 });
  }
}
