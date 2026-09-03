import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { createRunContext, ensureProductionSchema, startRun, enqueueBackgroundResearch } from "@/lib/agent/production";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    await ensureProductionSchema();
    const body = await request.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) return NextResponse.json({ error: "Research query is required." }, { status: 400 });
    const run = createRunContext(user.uid, "background_research", (process.env.AI_PROVIDER || "gemini").trim().toLowerCase(), process.env.AI_DEEP_MODEL || process.env.GEMINI_MODEL || process.env.OPENROUTER_MODEL || "default");
    await startRun(run, { background: true, query });
    const job = await enqueueBackgroundResearch(user.uid, { query, history: Array.isArray(body?.history) ? body.history.slice(-12) : [], chatId: typeof body?.chatId === "string" ? body.chatId : null }, run.runId);
    return NextResponse.json({ runId: run.runId, jobId: job.id, status: job.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not queue background research." }, { status: 500 });
  }
}
