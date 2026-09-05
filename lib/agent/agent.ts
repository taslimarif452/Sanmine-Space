import { getProvider, type ChatMessage } from "@/lib/ai/provider";
import { getTool, getToolDefinitions } from "@/lib/agent/tools";
import type { AgentEvent } from "@/lib/agent/tools/types";

const SYSTEM_PROMPT = `You are Samine AI Agent, a practical AI workspace for research, lead generation, and outreach.
Your name is exactly "Samine AI Agent". If the user asks your name, who you are, or asks you to introduce yourself, always identify yourself as "Samine AI Agent". Never introduce yourself as "Sanmine Space".
Your founder and developer is exactly "Tavqeer Hussain". Your co-founder is exactly "Sahil Hussain". If the user asks who founded, developed, or created you, identify Tavqeer Hussain as the founder and developer, and Sahil Hussain as the co-founder. Do not substitute or invent other names for these roles.
Be concise, useful, and transparent. You are the reasoning layer of an agentic system.
You have access to tools. Use a tool when it is necessary to complete the user's request rather than pretending you already have external data.

TOOL ROUTING — IMPORTANT:
- If the user asks about YouTube, YouTubers, creators, channels, channel statistics, creator discovery, or YouTube videos, you MUST use the youtube_search tool first. Do NOT use search_web as a substitute for YouTube data.
- For creator research with filters such as no website and a public contact email in the channel description, search a broad candidate pool and return only verified matches. If the user requests a minimum and maximum, never knowingly return fewer than the minimum when enough verified candidates exist.
- If youtube_search returns not_configured, clearly report that YOUTUBE_API_KEY is not configured. If it returns a success response with zero results, do NOT blame the API key; report that the normalized YouTube query returned no matching channels.
- If youtube_search returns an API error, clearly report the actual API error and do not silently fall back to random websites.
- For normal web research that is not specifically a YouTube request, prefer search_web for discovery, then open_page or website_analyze for source inspection.
- When a business website is found, use website_analyze when the user asks to evaluate or research that business.
- For proposals, pitches, statements of work, or client offers, use generate_proposal. For cold outreach, introductions, follow-ups, or sales emails, use generate_outreach_email.
- If the user explicitly asks for a simple/test email, use send_test_email. If the user provides an explicit recipient email address, ALWAYS pass that address as 'to' and send to that exact address. Never replace an explicit recipient with the connected Gmail account.
- IMPORTANT OUTREACH ACTION: If the user explicitly asks to SEND, EMAIL, or SEND THE PROPOSAL to researched prospects, use send_proposal_outreach and do not stop at drafting. The tool must verify the connected Gmail account before sending.
- For a researched creator list from an earlier assistant response, send to the exact verified contact emails in that research result. Do not discard the research list and do not substitute the connected sender account as recipient.
- If the user only asks to draft/write a proposal or email, do NOT send it.

RESPONSE FORMAT:
- Write normal answers in clean Markdown with headings, short paragraphs, bullets, and numbered lists where useful.
- When presenting structured records, comparisons, creator lists, lead lists, metrics, or other row/column data, prefer a Markdown table.
- Never claim an external action happened unless a tool confirms it.
- Reply in the same language/style as the user's latest message whenever practical.

When generating outreach copy, use available research from the conversation and tool results for personalization. Never invent company facts, metrics, case studies, pricing, dates, relationships, or claims. Missing commercial details should remain TBD or be left as a clear placeholder.
If a requested tool is unavailable or returns not_configured, clearly say that capability is not connected yet.`;

const MAX_TOOL_ROUNDS = 8;
const isYouTubeRequest = (message: string) => /\byoutube\b|\byoutuber(s)?\b|youtube\s*(creator|channel|video)/i.test(message);
const isCreatorRequest = (message: string) => /creator|creators|youtuber|channel|channels|subscriber|followers|views/i.test(message);
const isNoWebsiteRequest = (message: string) => /no\s+(a\s+)?website|without\s+(a\s+)?website|website\s*(nahi|nahin|nhi|nh)|website\s*(is\s*)?not/i.test(message);
const isIndiaRequest = (message: string) => /\bindia\b|\bindian\b|bharat|bhartiya/i.test(message);
const isDraftOnlyRequest = (message: string) => /\bdraft\b|\bwrite\b|\bcompose\b/i.test(message) && !/\bsend\b|\bemail\b|\bmail\b|\bhej/i.test(message);
const isTestEmailRequest = (message: string) => /(test|testing|simple\s+(hi|hello|message|msg)|simple\s+email).*(email|mail)|(email|mail).*(test|testing|simple\s+(hi|hello|message|msg))/i.test(message) && /\bsend\b|\bemail\b|\bmail\b|\bhej(?:o|\s+do)?\b/i.test(message);
const isExplicitSendRequest = (message: string) => /\bsend\b|\bemail\b|\bmail\b|\bhej(?:o|\s+do)?\b/i.test(message) && !isDraftOnlyRequest(message) && /proposal|outreach|creator|email|prospect|them|each|these|bhej/i.test(message);
const isCombinedBusinessOutreachRequest = (message: string) => isExplicitSendRequest(message) && isWebResearchRequest(message) && /\b(business|businesses|bussiness|bussinesses|company|companies|shop|shops|salon|restaurant|store|stores)\b/i.test(message) && /no\s+(a\s+)?website|without\s+(a\s+)?website|website\s*(nahi|nahin|nhi|nh)|website\s*(is\s*)?not/i.test(message);
const isWebResearchRequest = (message: string) => /\bresearch\b|\bcheck\b|\bsearch\b|\bfind\b|\blook\s*up\b|\bdetails?\b|\bavailable\b|\bavailability\b|\bdomain\b|\bwebsite\b|\bsite\b|\bgo\s*dad(?:d?y)?\b|\bextract\b|\bnikal(?:o|na|ke)?\b|\bdekho\b|\bdekh\s*kar\b|\bcurrent\b|\blatest\b/i.test(message);

function detectLanguage(text: string) {
  if (/[\u0900-\u097F]/.test(text) || /\b(है|हूं|करो|भेजो|भेज|पहले|चाहिए|नहीं|करना)\b/.test(text)) return "hi";
  if (/[\u0980-\u09FF]/.test(text)) return "bn";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  if (/[\u3040-\u30FF]/.test(text)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
  if (/\b(quiero|envía|enviar|correo|primero|conecta|conectado|sitio web)\b/i.test(text)) return "es";
  if (/\b(je veux|envoyer|e-mail|connecte|connecté|site web)\b/i.test(text)) return "fr";
  return "en";
}

function stripCell(value: string) {
  return value.replace(/!\[[^\]]*\]\(([^)]*)\)/g, "$1").replace(/\[([^\]]+)\]\(([^)]*)\)/g, "$2").replace(/[`*_]/g, "").trim();
}

function parseResearchTargets(history: ChatMessage[]) {
  for (const message of [...history].reverse()) {
    if (message.role !== "assistant") continue;
    const content = message.content;
    const tableLines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("|") && line.endsWith("|"));
    for (let i = 0; i < tableLines.length - 1; i += 1) {
      const headers = tableLines[i].slice(1, -1).split("|").map(stripCell);
      const separator = tableLines[i + 1].slice(1, -1).split("|").every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
      if (!separator) continue;
      const normalized = headers.map((header) => header.toLowerCase().replace(/\s+/g, " ").trim());
      const indexFor = (pattern: RegExp) => normalized.findIndex((header) => pattern.test(header));
      const nameIndex = indexFor(/creator|channel\s*name|^name$/);
      const emailIndex = indexFor(/contact\s*email|email|e-mail/);
      if (nameIndex < 0) continue;
      const countryIndex = indexFor(/country|location/);
      const subscribersIndex = indexFor(/subscriber/);
      const viewsIndex = indexFor(/total\s*views|views/);
      const nicheIndex = indexFor(/niche|category|topic/);
      const channelIndex = indexFor(/channel\s*(url|link)|youtube\s*(url|link)/);
      const descriptionIndex = indexFor(/description|highlight|summary/);
      const targets: Array<Record<string, string>> = [];
      for (const row of tableLines.slice(i + 2)) {
        const cells = row.slice(1, -1).split("|").map(stripCell);
        if (cells.length < headers.length) continue;
        const name = cells[nameIndex];
        if (!name || /^[-—]+$/.test(name) || /status|message id/i.test(name)) continue;
        const target: Record<string, string> = { name };
        if (emailIndex >= 0 && cells[emailIndex]) target.email = cells[emailIndex].match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || "";
        if (countryIndex >= 0) target.country = cells[countryIndex];
        if (subscribersIndex >= 0) target.subscribers = cells[subscribersIndex];
        if (viewsIndex >= 0) target.total_views = cells[viewsIndex];
        if (nicheIndex >= 0) target.niche = cells[nicheIndex];
        if (channelIndex >= 0) target.channel_url = cells[channelIndex].match(/https?:\/\/\S+/i)?.[0] || cells[channelIndex];
        if (descriptionIndex >= 0) target.description = cells[descriptionIndex];
        targets.push(target);
      }
      if (targets.length) return targets.slice(0, 10);
    }
    const emailMatches = [...content.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase());
    if (emailMatches.length >= 8) {
      const unique = [...new Set(emailMatches)].slice(0, 10);
      return unique.map((email) => ({ name: email.split("@")[0], email }));
    }
  }
  return [] as Array<Record<string, string>>;
}

function buildSendSummary(result: any, language: string) {
  if (result?.status === "needs_connection" || result?.status === "provider_unavailable") return String(result.message || "Please connect an email provider from Plugins before sending.");
  const sent = Array.isArray(result?.sent) ? result.sent : [];
  const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
  const failed = Array.isArray(result?.failed) ? result.failed : [];
  const sentCount = Number.isFinite(Number(result?.sent_count)) ? Number(result.sent_count) : sent.length;
  const skippedCount = Number.isFinite(Number(result?.skipped_count)) ? Number(result.skipped_count) : skipped.length;
  const failedCount = Number.isFinite(Number(result?.failed_count)) ? Number(result.failed_count) : failed.length;
  const processedCount = sentCount + skippedCount + failedCount;
  const labels = {
    hi: { title: "## Outreach complete", processed: "Maine", prospects: "researched prospects ko process kiya", sent: "### Successfully sent", none: "Kisi ko send nahi hua", skipped: "### Skipped", failed: "### Failed", proof: "Har sent email ko Gmail success response ke baad hi sent maana gaya hai." },
    bn: { title: "## Outreach সম্পন্ন", processed: "আমি", prospects: "researched prospects process করেছি", sent: "### সফলভাবে পাঠানো হয়েছে", none: "কোনও email পাঠানো হয়নি", skipped: "### Skipped", failed: "### Failed", proof: "Gmail-এর সফল response পাওয়ার পরেই কোনও email-কে sent হিসেবে ধরা হয়েছে।" },
    es: { title: "## Outreach completado", processed: "Procesé", prospects: "prospectos investigados", sent: "### Enviados correctamente", none: "No se envió ningún email", skipped: "### Omitidos", failed: "### Fallidos", proof: "Un email solo se marca como enviado después de una respuesta exitosa de Gmail." },
    fr: { title: "## Prospection terminée", processed: "J’ai traité", prospects: "prospects recherchés", sent: "### Envoyés avec succès", none: "Aucun email n’a été envoyé", skipped: "### Ignorés", failed: "### Échecs", proof: "Un email est marqué comme envoyé uniquement après une réponse réussie de Gmail." },
    en: { title: "## Outreach completed", processed: "I processed", prospects: "researched prospects", sent: "### Sent successfully", none: "None", skipped: "### Skipped", failed: "### Failed", proof: "Each email is marked as sent only after Gmail returns a successful send response." },
  }[language as "hi" | "bn" | "es" | "fr" | "en"] || undefined;
  const l = labels || { title: "## Outreach completed", processed: "I processed", prospects: "researched prospects", sent: "### Sent successfully", none: "None", skipped: "### Skipped", failed: "### Failed", proof: "Each email is marked as sent only after Gmail returns a successful send response." };
  const lines = [l.title, `${l.processed} **${processedCount}** ${l.prospects}${result?.sender ? ` (${result.sender})` : ""}.`, "", sentCount ? l.sent : `${l.sent}\n${l.none}`, ...(sent.length ? sent.map((item: any) => `- **${item.creator}** → ${item.email} — ${item.subject || "Website proposal"}`) : []), "", skipped.length ? l.skipped : "", ...(skipped.length ? skipped.map((item: any) => `- **${item.creator}** — ${item.reason}`) : []), "", failed.length ? l.failed : "", ...(failed.length ? failed.map((item: any) => `- **${item.creator}**${item.email ? ` → ${item.email}` : ""} — ${item.reason}`) : []), "", l.proof].filter(Boolean);
  return lines.join("\n");
}

function extractEmailAddress(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || "";
}

function extractTestMessage(text: string) {
  const match = text.match(/\b(?:tell|say)\s+(?:him|her|them)\s+(.+?)(?:\s+then\b|\s+and\s+then\b|$)/i);
  return match?.[1]?.trim() || "This is a test email from Sanmine Space.";
}

function createAgent() {
  return getProvider();
}

export async function runAgent(history: ChatMessage[], userMessage: string, emit: (event: AgentEvent) => void, userId?: string, onText?: (delta: string) => void, userEmail?: string) {
  const provider = createAgent();
  const tools = getToolDefinitions();
  const events: AgentEvent[] = [];
  const record = (event: AgentEvent) => { events.push(event); emit(event); };
  const streamText = (delta: string) => { if (delta) onText?.(delta); };
  const emitThinking = () => record({ type: "thinking", name: "assistant_generation", toolCallId: `thinking-${Date.now()}-${events.length}` });
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }, ...history.slice(-12), { role: "user", content: userMessage }];

  if (isYouTubeRequest(userMessage)) {
    const youtube = getTool("youtube_search");
    if (!youtube) return { response: "YouTube Data API v3 is not connected in this workspace yet.", events };
    record({ type: "tool_start", name: "youtube_search", toolCallId: "forced-youtube-search" });
    let result: unknown;
    try { result = await youtube.execute({ query: userMessage, limit: 10, type: isCreatorRequest(userMessage) || isNoWebsiteRequest(userMessage) ? "creator" : "video", region_code: isIndiaRequest(userMessage) ? "IN" : undefined, user_id: userId }); }
    catch (error) { result = { status: "error", source: "YouTube Data API v3", message: error instanceof Error ? error.message : "YouTube search failed." }; }
    record({ type: "tool_result", name: "youtube_search", toolCallId: "forced-youtube-search", result });
    messages.push({ role: "user", content: `Authoritative YouTube Data API v3 tool result. Use this result for the YouTube portion of the answer and do not claim the API key is missing unless status is not_configured:\n${JSON.stringify(result)}` });
  }

  if (isTestEmailRequest(userMessage) && userId) {
    const testTool = getTool("send_test_email");
    if (!testTool) return { response: "Test email sending is not connected in this workspace yet.", events };
    const explicitRecipient = extractEmailAddress(userMessage);
    const testMessage = extractTestMessage(userMessage);
    record({ type: "tool_start", name: "send_test_email", toolCallId: "forced-test-email" });
    let result: unknown;
    try { result = await testTool.execute({ user_id: userId, user_email: userEmail, to: explicitRecipient || undefined, subject: "Sanmine Space email test", message: testMessage }); }
    catch (error) { result = { status: "error", message: error instanceof Error ? error.message : "Test email sending failed." }; }
    record({ type: "tool_result", name: "send_test_email", toolCallId: "forced-test-email", result });
    const language = detectLanguage(userMessage);
    const response = result && typeof result === "object" && (result as any).status === "sent" ? (language === "hi" ? `Test email successfully send ho gaya **${(result as any).to}** par.` : `Test email was successfully sent to **${(result as any).to}**.`) : String((result as any)?.message || "Test email send nahi ho paya.");
    emitThinking(); streamText(response); return { response, events };
  }

  const researchTargets = parseResearchTargets(history);
  if (isCombinedBusinessOutreachRequest(userMessage) && userId && !researchTargets.length) {
    const searchTool = getTool("search_web"); const sendTool = getTool("send_proposal_outreach");
    if (!searchTool || !sendTool) return { response: "Research or outreach is not connected in this workspace yet.", events };
    const searchQueries = [`${userMessage} real local businesses public contact email`, `small business no website public email contact`, `local business without website contact email`];
    const searchResults: Array<{ title?: string; url?: string; snippet?: string }> = [];
    for (const query of searchQueries) {
      const id = `combined-search-${Date.now()}-${events.length}`; record({ type: "tool_start", name: "search_web", toolCallId: id });
      try { const result = await searchTool.execute({ query, limit: 10 }); record({ type: "tool_result", name: "search_web", toolCallId: id, result }); const rows = Array.isArray((result as any)?.results) ? (result as any).results : []; for (const row of rows) if (row?.title && row?.url) searchResults.push({ title: String(row.title), url: String(row.url), snippet: row.snippet ? String(row.snippet) : undefined }); } catch (error) { record({ type: "tool_result", name: "search_web", toolCallId: id, result: { status: "error", message: error instanceof Error ? error.message : "Search failed." } }); }
      if (searchResults.length >= 10) break;
    }
    const seen = new Set<string>();
    const targets = searchResults.filter((row) => { const key = (row.title || row.url || "").toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return !/\b(best|guide|how to|how-to|tips|directory|directories|list of|find businesses|business ideas)\b/i.test(row.title || ""); }).slice(0, 10).map((row) => ({ name: row.title!.replace(/\s*[|—-]\s*.*$/, "").trim(), description: row.snippet || "", channel_url: row.url }));
    if (!targets.length) return { response: "I could not find usable real-business search results for this request. I will not invent businesses or email addresses.", events };
    record({ type: "tool_start", name: "send_proposal_outreach", toolCallId: "combined-proposal-send" }); let sendResult: unknown;
    try { sendResult = await sendTool.execute({ user_id: userId, user_email: userEmail, targets, offer: "Build a professional website for the business and provide a free custom homepage demo for review, with no obligation.", sender_name: "Sanmine Space", user_language: detectLanguage(userMessage) }); } catch (error) { sendResult = { status: "error", message: error instanceof Error ? error.message : "Proposal sending failed." }; }
    record({ type: "tool_result", name: "send_proposal_outreach", toolCallId: "combined-proposal-send", result: sendResult }); return { response: buildSendSummary(sendResult, detectLanguage(userMessage)), events };
  }

  if (isExplicitSendRequest(userMessage) && userId && researchTargets.length) {
    const sendTool = getTool("send_proposal_outreach");
    if (!sendTool) return { response: "Proposal sending is not connected in this workspace yet.", events };
    record({ type: "tool_start", name: "send_proposal_outreach", toolCallId: "forced-proposal-send" });
    let result: unknown;
    try { result = await sendTool.execute({ user_id: userId, user_email: userEmail, targets: researchTargets.slice(0, 10), offer: "Build a professional website for the creator and provide a free custom homepage demo for review, with no obligation.", sender_name: "Sanmine Space", user_language: detectLanguage(userMessage) }); }
    catch (error) { result = { status: "error", message: error instanceof Error ? error.message : "Proposal sending failed." }; }
    record({ type: "tool_result", name: "send_proposal_outreach", toolCallId: "forced-proposal-send", result });
    const response = buildSendSummary(result, detectLanguage(userMessage)); emitThinking(); streamText(response); return { response, events };
  }

  const researchMode = !isYouTubeRequest(userMessage) && isWebResearchRequest(userMessage);
  if (researchMode) {
    const searchTool = getTool("search_web");
    if (searchTool) {
      const searchId = `forced-web-search-${Date.now()}`; record({ type: "tool_start", name: "search_web", toolCallId: searchId }); let result: unknown;
      try { result = await searchTool.execute({ query: userMessage, limit: 8 }); } catch (error) { result = { status: "error", message: error instanceof Error ? error.message : "Web search failed." }; }
      record({ type: "tool_result", name: "search_web", toolCallId: searchId, result }); messages.push({ role: "user", content: `Preliminary web search result for this request. Use these sources as the starting evidence. Do not call search_web again for the same query unless the result is clearly insufficient; you may use open_page or website_analyze when a source needs deeper inspection.\n${JSON.stringify(result)}` });
    }
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    emitThinking();
    const response = await provider.chatStream(messages, tools, streamText);
    if (!response.toolCalls.length) { const finalText = response.text || "I’m ready. What would you like me to do?"; return { response: finalText, events }; }
    for (const call of response.toolCalls) {
      const tool = getTool(call.name);
      if ((isYouTubeRequest(userMessage) && call.name === "youtube_search") || (researchMode && call.name === "search_web")) { messages.push({ role: "user", content: `The ${call.name} request has already been executed above. Use the existing tool result and do not call ${call.name} again for this request.` }); continue; }
      record({ type: "tool_start", name: call.name, toolCallId: call.id }); let result: unknown;
      if (!tool) result = { status: "error", message: `Unknown tool: ${call.name}` };
      else { try { const argumentsForTool = (call.name === "send_proposal_outreach" || call.name === "send_test_email") && userId ? { ...call.arguments, user_id: userId, user_email: userEmail } : call.arguments; result = await tool.execute(argumentsForTool); } catch (error) { result = { status: "error", message: error instanceof Error ? error.message : "Tool execution failed." }; } }
      record({ type: "tool_result", name: call.name, toolCallId: call.id, result });
      if (response.text) messages.push({ role: "assistant", content: response.text }); messages.push({ role: "user", content: `Tool result for ${call.name} (call ${call.id}):\n${JSON.stringify(result)}` });
    }
  }
  const response = "I reached the tool-call limit for this request. Please try the task again."; streamText(response); return { response, events };
}
