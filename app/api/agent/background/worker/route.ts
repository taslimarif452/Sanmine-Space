import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/agent";
import { getProviderTask, withProviderTask } from "@/lib/ai/request-context";
import { claimBackgroundJob, completeBackgroundJob, ensureProductionSchema, finishRun, recordProviderResult, createRunContext } from "@/lib/agent/production";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureProductionSchema();
    const job = await claimBackgroundJob();
    if (!job) return NextResponse.json({ status: "idle" });
    const started = Date.now();
    try {
      const payload = job.payload && typeof job.payload === "object" ? job.payload as Record<string, unknown> : {};
      const query = typeof payload.query === "string" ? payload.query : "";
      const history = Array.isArray(payload.history) ? payload.history : [];
      const task = getProviderTask();
      const result = await withProviderTask(task === "balanced" ? "deep" : task, () => runAgent(history as any, query, undefined, String(job.user_id)));
      await finishRun(createRunContext(String(job.user_id), "background_research"), "completed", { jobId: job.id, resultLength: result.response?.length || 0 });
      await completeBackgroundJob(String(job.id), true);
      await recordProviderResult((process.env.AI_PROVIDER || "gemini").trim().toLowerCase(), true, Date.now() - started);
      return NextResponse.json({ status: "completed", jobId: job.id, runId: job.run_id, response: result.response });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background research failed.";
      await completeBackgroundJob(String(job.id), false, message);
      await recordProviderResult((process.env.AI_PROVIDER || "gemini").trim().toLowerCase(), false, Date.now() - started, message);
      return NextResponse.json({ status: "failed", jobId: job.id, runId: job.run_id, error: message }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Background worker failed." }, { status: 500 });
  }
}
