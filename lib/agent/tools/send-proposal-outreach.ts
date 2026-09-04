import { sql } from "@/lib/db/neon";
import { sendGmailMessage } from "@/lib/email/gmail";
import { ensureProductionSchema } from "@/lib/agent/production";
import type { AgentTool } from "@/lib/agent/tools/types";

type Target = {
  name: string;
  email?: string;
  country?: string;
  subscribers?: string | number;
  total_views?: string | number;
  niche?: string;
  channel_url?: string;
  description?: string;
};
type TavilyResult = { title?: string; url?: string; content?: string };
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function connectionMessage(language: string) {
  const messages: Record<string, string> = {
    hi: "Proposal bhejne ke liye Plugins page par Gmail connect karo.",
    bn: "Proposal পাঠানোর জন্য Plugins পেজে Gmail connect করুন।",
    es: "Conecta Gmail desde Plugins para enviar las propuestas.",
    fr: "Connectez Gmail depuis Plugins pour envoyer les propositions.",
    en: "Connect Gmail from Plugins before sending proposals.",
  };
  return messages[language] || messages.en;
}
function extractBusinessEmails(text: string) {
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(emails.map((x) => x.toLowerCase()))].filter((email) => !/example\.com|sentry|wixpress|cloudflare|noreply|no-reply|support@|privacy@|legal@|abuse@/i.test(email));
}
async function findContact(name: string, sourceUrl = "") {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return { status: "not_configured", email: null, sources: [] as Array<{ title: string; url: string; snippet: string }> };
  const queries = [
    `"${name}" contact email`,
    `"${name}" email address`,
    sourceUrl ? `"${name}" "${sourceUrl}" email` : `"${name}" contact us email`,
  ];
  const responses = await Promise.all(queries.map(async (query) => {
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, query, max_results: 5, search_depth: "basic", include_answer: false, include_raw_content: false }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return [] as TavilyResult[];
      const data = await response.json() as { results?: TavilyResult[] };
      return data.results ?? [];
    } catch { return [] as TavilyResult[]; }
  }));
  const sources: Array<{ title: string; url: string; snippet: string }> = [];
  const emails: string[] = [];
  for (const results of responses) for (const result of results) {
    const title = clean(result.title) || "Untitled source";
    const url = clean(result.url);
    const snippet = clean(result.content);
    sources.push({ title, url, snippet });
    emails.push(...extractBusinessEmails(`${title}\n${url}\n${snippet}`));
  }
  return { status: "success", email: emails[0] ?? null, emails: [...new Set(emails)], sources: sources.slice(0, 8) };
}
function buildEmail(target: Target, offer: string, language: string) {
  const name = target.name || "your business";
  const research = target.description ? ` I noticed that ${target.description.replace(/\s+/g, " ").slice(0, 220)}.` : "";
  const subject = language === "hi" ? `${name} ke liye ek simple website idea` : `A simple website idea for ${name}`;
  const body = language === "hi"
    ? `Hi,\n\nMain Sanmine Space se hoon. Main small businesses ke liye professional websites banata hoon.${research}\n\nAapke business ke liye ${offer.toLowerCase()} kar sakta hoon, aur review ke liye ek custom homepage demo bhi bana sakta hoon.\n\nAgar aap interested hain, main demo share kar sakta hoon.\n\nThanks,\nSanmine Space`
    : `Hi,\n\nI’m reaching out from Sanmine Space. We build professional websites for small businesses.${research}\n\nWe can ${offer.toLowerCase()}, and I can also prepare a custom homepage demo for you to review with no obligation.\n\nIf you’re interested, I can share the demo.\n\nThanks,\nSanmine Space`;
  return { subject, body };
}

export const sendProposalOutreachTool: AgentTool = {
  name: "send_proposal_outreach",
  description: "For an explicit user request to send proposals, verify Gmail, find public business/contact emails, personalize a concise proposal email from supplied evidence, and send it immediately. Never guess an email address. Skip prospects without a public email and report them.",
  parameters: { type: "object", properties: {
    user_id: { type: "string" },
    targets: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, email: { type: "string" }, country: { type: "string" }, subscribers: { type: "string" }, total_views: { type: "string" }, niche: { type: "string" }, channel_url: { type: "string" }, description: { type: "string" }
    }, required: ["name"] } },
    offer: { type: "string" }, sender_name: { type: "string" }, user_language: { type: "string" }
  }, required: ["targets", "offer"] },
  execute: async (args) => {
    const userId = clean(args.user_id);
    const targets = Array.isArray(args.targets) ? (args.targets as Target[]).slice(0, 10) : [];
    const offer = clean(args.offer);
    const language = clean(args.user_language) || "en";
    if (!userId) return { status: "error", message: "Authenticated user context is missing." };
    if (!targets.length) return { status: "error", message: "No prospects were supplied." };
    if (!offer) return { status: "error", message: "An offer is required." };

    const connections = await sql`SELECT id, provider, email FROM email_connections WHERE user_id=${userId} ORDER BY updated_at DESC`;
    const gmail = connections.find((row) => String((row as any).provider) === "google") as { id: string; provider: string; email: string } | undefined;
    if (!gmail) return { status: "needs_connection", sent: [], skipped: [], failed: [], connected_providers: connections.map((row) => String((row as any).provider)), message: connectionMessage(language) };

    await ensureProductionSchema();
    const sent: Array<Record<string, string>> = [];
    const skipped: Array<Record<string, string>> = [];
    const failed: Array<Record<string, string>> = [];

    for (const target of targets) {
      let email = clean(target.email).toLowerCase();
      const contact = email ? null : await findContact(clean(target.name), clean(target.channel_url));
      if (!email) email = clean(contact?.email).toLowerCase();
      if (!email) {
        skipped.push({ creator: clean(target.name) || "Unknown prospect", reason: contact?.status === "not_configured" ? "Public contact email lookup is not configured." : "No public business/contact email found." });
        continue;
      }
      const { subject, body } = buildEmail(target, offer, language);
      try {
        const result = await sendGmailMessage(userId, gmail.id, { to: email, subject, body });
        const approval = await sql`INSERT INTO email_approvals (user_id, connection_id, recipient, subject, body, status, approved_at, sent_at, provider_message_id, send_attempts, sending_started_at, updated_at) VALUES (${userId}, ${gmail.id}, ${email}, ${subject}, ${body}, 'sent', NOW(), NOW(), ${result.id || null}, 1, NULL, NOW()) RETURNING id`;
        await sql`INSERT INTO email_events (user_id, approval_id, recipient, event_type, provider_message_id, provider_thread_id, metadata) VALUES (${userId}, ${approval[0]?.id || null}, ${email}, 'sent', ${result.id || null}, ${result.threadId || null}, ${JSON.stringify({ source: "agent_outreach" })}::jsonb)`;
        sent.push({ creator: clean(target.name) || "Prospect", email, subject, message_id: result.id || "" });
      } catch (error) {
        failed.push({ creator: clean(target.name) || "Prospect", email, reason: error instanceof Error ? error.message : "Gmail send failed." });
      }
    }
    return { status: sent.length ? "sent" : failed.length ? "failed" : "completed", sender: gmail.email, sent, skipped, failed, sent_count: sent.length, skipped_count: skipped.length, failed_count: failed.length };
  }
};
