import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/agent";
import type { ChatMessage } from "@/lib/ai/provider";
import type { AgentEvent } from "@/lib/agent/tools/types";
import { getRequestUser } from "@/lib/auth/request-user";
import { hasDatabaseConfig, sql } from "@/lib/db/neon";
import { runProductionMigrations } from "@/lib/db/migrations";
import { ChatRequestSchema } from "@/lib/api/schemas";
import { AppError, errorResponse, errorStatus } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { executeWithRetry, isToolTestRequest, isUnsafeAssistantOutput, normalizeToolResult, runSafeToolTest, MODEL_TIMEOUT_MS } from "@/lib/agent/reliability";
import { createRunContext, ensureProductionSchema, startRun, finishRun, recordStep, recordUsage, estimateTokens, estimateCost, getRunLimits, assertRunBudget, recordProviderResult, chooseModel, type AgentRunKind } from "@/lib/agent/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const isSimpleGreeting = (message: string) => /^(hi|hello|hey|hii|hiii|helo|hola|namaste|good\s+(morning|afternoon|evening|night))\s*[!.?]*$/i.test(message.trim());

function buildResearchFallback(events: AgentEvent[], userMessage: string) {
  const results: Array<{ title: string; url: string; snippet?: string }> = [];
  const statuses: string[] = [];
  for (const event of events) {
    if (event.type !== "tool_result") continue;
    const result = event.result as any;
    if (!result || typeof result !== "object") continue;
    if (result.status && result.status !== "success") statuses.push(`${event.name}: ${String(result.message || result.status)}`);
    if (Array.isArray(result.results)) for (const item of result.results) if (item?.url) results.push({ title: String(item.title || "Web source"), url: String(item.url), snippet: item.snippet ? String(item.snippet) : undefined });
    if (result.url) results.push({ title: String(result.title || result.url), url: String(result.url), snippet: typeof result.text === "string" ? result.text.slice(0, 220) : undefined });
  }
  const unique = [...new Map(results.map((item) => [item.url, item])).values()].slice(0, 8);
  if (!unique.length && statuses.length) return `I couldn't complete the requested research because a required tool failed.\n\n${statuses.map((s) => `- ${s}`).join("\n")}`;
  if (!unique.length) return `I started the requested research for **${userMessage.slice(0, 100)}**, but the research tools did not return usable source data. Please try the request again.`;
  return `## Research results\n\nI completed the web research and found **${unique.length} source${unique.length === 1 ? "" : "s"}**.\n\n${unique.map((item, index) => `${index + 1}. **${item.title}**\n   ${item.url}${item.snippet ? `\n   ${item.snippet.replace(/\s+/g, " ").slice(0, 220)}` : ""}`).join("\n\n")}`;
}

async function prepareChat(user: Awaited<ReturnType<typeof getRequestUser>>, message: string, requestedChatId?: string | null) {
  if (!hasDatabaseConfig()) return null;
  try {
    await sql`INSERT INTO users (id, email, name, image) VALUES (${user.uid}, ${user.email ?? `${user.uid}@unknown.local`}, ${user.name ?? null}, ${user.picture ?? null}) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, image = EXCLUDED.image, updated_at = NOW()`;
    let chatId = requestedChatId || null;
    if (chatId) {
      const owned = await sql`SELECT id FROM chats WHERE id = ${chatId} AND user_id = ${user.uid} LIMIT 1`;
      if (!owned.length) chatId = null;
    }
    if (!chatId) {
      const rows = await sql`INSERT INTO chats (user_id, title) VALUES (${user.uid}, 'New chat') RETURNING id`;
      chatId = String(rows[0].id);
    }
    const existingUser = await sql`SELECT id FROM messages WHERE chat_id = ${chatId} AND role = 'user' AND content = ${message} AND created_at > NOW() - INTERVAL '2 minutes' ORDER BY created_at DESC LIMIT 1`;
    if (!existingUser.length) await sql`INSERT INTO messages (chat_id, role, content, metadata) VALUES (${chatId}, 'user', ${message}, ${JSON.stringify({ kind: "user_message", createdAt: new Date().toISOString() })}::jsonb)`;
    await sql`UPDATE chats SET title = CASE WHEN title = 'New chat' THEN ${message.slice(0, 120)} ELSE title END, updated_at = NOW() WHERE id = ${chatId} AND user_id = ${user.uid}`;
    return chatId;
  } catch (error) {
    console.error("Chat preparation warning:", error);
    return null;
  }
}

async function persistAssistant(user: Awaited<ReturnType<typeof getRequestUser>>, chatId: string | null, responseText: string, metadata: Record<string, unknown>) {
  if (!chatId || !hasDatabaseConfig()) return false;
  try {
    await sql`INSERT INTO messages (chat_id, role, content, metadata) VALUES (${chatId}, 'assistant', ${responseText}, ${JSON.stringify(metadata)}::jsonb)`;
    await sql`UPDATE chats SET updated_at = NOW() WHERE id = ${chatId} AND user_id = ${user.uid}`;
    return true;
  } catch (error) {
    console.error("Assistant persistence warning:", error);
    return false;
  }
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof getRequestUser>>;
  try { user = await getRequestUser(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Authentication failed.", code: "AUTH_ERROR" }, { status: 401 }); }

  try {
    if (!hasDatabaseConfig()) throw new AppError("CONFIG_ERROR", "Database persistence is not configured.", 503);
    const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", parsed.error.issues[0]?.message || "Invalid chat request.", 400);
    const { message, history, chatId: requestedChatId } = parsed.data;
    const chatHistory = history as ChatMessage[];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (payload: Record<string, unknown>) => { if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`)); };
        const startAt = Date.now();
        let runKind: AgentRunKind = "chat";
        if (isToolTestRequest(message)) runKind = "tool_test";
        else if (/research|research.*background|deep research|in background/i.test(message)) runKind = /background|deep/i.test(message) ? "background_research" : "research";
        const selectedModel = chooseModel(runKind, runKind === "chat" ? "balanced" : "deep");
        const providerName = (process.env.AI_PROVIDER || "gemini").trim().toLowerCase();
        const run = createRunContext(user.uid, runKind, providerName, selectedModel);
        let step = 0;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCost = 0;
        try {
          send({ type: "run", runId: run.runId, kind: run.kind, limits: getRunLimits() });
          send({ type: "event", event: { type: "thinking", name: "request_start", toolCallId: `request-${run.runId}` } });
          await ensureProductionSchema();
          await startRun(run, { messageLength: message.length });
          step += 1;
          await recordStep(run, step, "lifecycle", "request_start", "completed", Date.now() - startAt);
          await enforceRateLimit(`chat:${user.uid}`, 30, 60_000);
          const chatId = await prepareChat(user, message, requestedChatId);
          if (chatId) send({ type: "chat", chatId });

          if (isSimpleGreeting(message)) {
            const greetingResponse = "Hi! 👋 How can I help you today?";
            const outputTokens = estimateTokens(greetingResponse);
            const usage = estimateCost(providerName, selectedModel, estimateTokens(message), outputTokens);
            await recordUsage(run, usage);
            await persistAssistant(user, chatId, greetingResponse, { kind: "chat_response", mode: "greeting", runId: run.runId, durationMs: Date.now() - startAt, usage });
            send({ type: "delta", delta: greetingResponse });
            send({ type: "done", response: greetingResponse, events: [], chatId, runId: run.runId, metadata: { mode: "greeting", runId: run.runId, usage }, persistence: chatId ? "saved" : "unavailable" });
            await finishRun(run, "completed", { mode: "greeting" });
            closed = true; controller.close(); return;
          }

          if (isToolTestRequest(message)) {
            send({ type: "event", event: { type: "thinking", name: "tool_test", toolCallId: `tool-test-${run.runId}` } });
            step += 1;
            const testStarted = Date.now();
            const report = await runSafeToolTest((event) => send({ type: "event", event }));
            await recordStep(run, step, "tool_test", "safe_tool_test", "completed", Date.now() - testStarted, undefined, { tools: report.map((x) => x.tool) });
            const passed = report.filter((x) => x.status === "passed").length;
            const response = ["## Tool health check", "", `Tested **${report.length}** safe tools: **${passed} passed**.`, "", "| Tool | Status | Details |", "| --- | --- | --- |", ...report.map((x) => `| ${x.tool} | ${x.status === "passed" ? "✅ Passed" : x.status === "unavailable" ? "⚪ Unavailable" : "❌ Failed"} | ${x.message.replace(/\|/g, "\\|")} |`)].join("\n");
            const outputTokens = estimateTokens(response);
            const usage = estimateCost(providerName, selectedModel, estimateTokens(message), outputTokens);
            totalOutputTokens += outputTokens; totalInputTokens += estimateTokens(message); totalCost += usage.totalCostUsd;
            assertRunBudget(run, totalInputTokens, totalOutputTokens, totalCost);
            await recordUsage(run, usage);
            const saved = await persistAssistant(user, chatId, response, { kind: "tool_test", runId: run.runId, report, durationMs: Date.now() - startAt, usage });
            send({ type: "delta", delta: response });
            send({ type: "done", response, events: [], chatId, runId: run.runId, metadata: { mode: "tool_test", runId: run.runId, report, usage }, persistence: saved ? "saved" : "unavailable" });
            await finishRun(run, "completed", { mode: "tool_test", passed, total: report.length });
            closed = true; controller.close(); return;
          }

          const rawEvents: AgentEvent[] = [];
          let streamed = "";
          const result = await executeWithRetry(
            () => runAgent(chatHistory, message, (event) => {
              const safeEvent = event.type === "tool_result" ? { ...event, result: normalizeToolResult(event.name, event.toolCallId, event.result).result } : event;
              rawEvents.push(safeEvent);
              step += 1;
              const stepStarted = Date.now();
              recordStep(run, step, safeEvent.type, safeEvent.name || safeEvent.type, "completed", Date.now() - stepStarted, safeEvent.toolCallId).catch((e) => console.error("Step telemetry warning:", e));
              send({ type: "event", event: safeEvent });
            }, user.uid, (delta) => {
              if (!delta) return;
              streamed += delta;
              send({ type: "delta", delta });
            }),
            "Agent run",
            MODEL_TIMEOUT_MS * 4,
          );
          const events = rawEvents.length ? rawEvents : result.events;
          let responseText = result.response?.trim() || streamed.trim();
          if (isUnsafeAssistantOutput(responseText)) responseText = buildResearchFallback(events, message);
          if (!responseText) throw new Error("The AI completed without producing a usable answer.");
          totalInputTokens = estimateTokens(chatHistory.map((m) => m.content).join("\n") + message);
          totalOutputTokens = estimateTokens(responseText);
          const usage = estimateCost(providerName, selectedModel, totalInputTokens, totalOutputTokens);
          totalCost = usage.totalCostUsd;
          assertRunBudget(run, totalInputTokens, totalOutputTokens, totalCost);
          await recordUsage(run, usage);
          const toolCount = events.filter((e) => e.type === "tool_start").length;
          const metadata = { kind: "chat_response", runId: run.runId, durationMs: Date.now() - startAt, eventCount: events.length, toolCount, sources: events.filter((e) => e.type === "tool_result").map((e) => ({ name: e.name, toolCallId: e.toolCallId })), usage };
          const saved = await persistAssistant(user, chatId, responseText, metadata);
          send({ type: "done", response: responseText, events: events.filter((event) => event.type !== "thinking"), chatId, runId: run.runId, metadata, persistence: saved ? "saved" : "unavailable" });
          await finishRun(run, "completed", { toolCount, usage });
          await recordProviderResult(providerName, true, Date.now() - startAt);
          closed = true; controller.close();
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "Something went wrong while processing the chat request.";
          console.error("Chat stream error:", error);
          await finishRun(run, "failed", { durationMs: Date.now() - startAt }, messageText).catch(() => undefined);
          await recordProviderResult(providerName, false, Date.now() - startAt, messageText).catch(() => undefined);
          send({ type: "error", runId: run.runId, error: messageText, code: /not configured|api key|private key/i.test(messageText) ? "CONFIG_ERROR" : /timed out|timeout/i.test(messageText) ? "TIMEOUT" : "CHAT_ERROR" });
          closed = true; controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (error) {
    return NextResponse.json(errorResponse(error, "Something went wrong while processing the chat request."), { status: errorStatus(error) });
  }
}
