import { getProvider, type ChatMessage } from "@/lib/ai/provider";
import { sql } from "@/lib/db/neon";
import { sendGmailMessage } from "@/lib/email/gmail";
import type { AgentTool } from "@/lib/agent/tools/types";

type Target = {
  name: string;
  country?: string;
  subscribers?: string | number;
  total_views?: string | number;
  niche?: string;
  channel_url?: string;
  description?: string;
};

type TavilyResult = { title?: string; url?: string; content?: string };

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractBusinessEmails(text: string) {
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(emails.map((x) => x.toLowerCase()))].filter((email) => {
    const blocked = /example\.com|sentry|wixpress|cloudflare|noreply|no-reply|support@|privacy@|legal@|abuse@/i;
    return !blocked.test(email);
  });
}

async function findContact(name: string) {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return { status: "not_configured", email: null, sources: [], message: "TAVILY_API_KEY is not configured for public contact research." };

  const queries = [
    `"${name}" YouTube business email contact`,
    `"${name}" creator email sponsorship contact`,
    `"${name}" YouTube "@" email`,
  ];
  const sources: { title: string; url: string; snippet: string }[] = [];
  const emails: string[] = [];

  for (const query of queries) {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: 5, search_depth: "advanced", include_answer: false, include_raw_content: true }),
      cache: "no-store",
    });
    if (!response.ok) continue;
    const data = (await response.json()) as { results?: TavilyResult[] };
    for (const result of data.results ?? []) {
      const title = clean(result.title) || "Untitled source";
      const url = clean(result.url);
      const snippet = clean(result.content);
      sources.push({ title, url, snippet });
      emails.push(...extractBusinessEmails(`${title}\n${url}\n${snippet}`));
    }
    if (emails.length) break;
  }

  return { status: "success", email: emails[0] ?? null, emails: [...new Set(emails)], sources: sources.slice(0, 8) };
}

export const sendProposalOutreachTool: AgentTool = {
  name: "send_proposal_outreach",
  description: "For an explicit request to send website/service proposals by email, research public business contact emails for the supplied prospects, personalize a proposal email from the supplied research, and send it through the user's connected Gmail account. Only public business/contact emails are used. Do not use this for drafting-only requests.",
  parameters: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Authenticated Sanmine Space user id. Supplied by the agent runtime." },
      targets: {
        type: "array",
        description: "Prospects from the current research result.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            country: { type: "string" },
            subscribers: { type: "string" },
            total_views: { type: "string" },
            niche: { type: "string" },
            channel_url: { type: "string" },
            description: { type: "string" },
          },
          required: ["name"],
        },
      },
      offer: { type: "string", description: "Offer, e.g. a professional website and free demo for review." },
      sender_name: { type: "string", description: "Sender/signature name or brand." },
    },
    required: ["targets", "offer"],
  },
  execute: async (args) => {
    const userId = clean(args.user_id);
    const targets = Array.isArray(args.targets) ? (args.targets as Target[]).slice(0, 20) : [];
    const offer = clean(args.offer);
    const senderName = clean(args.sender_name) || "Sanmine Space";
    if (!userId) return { status: "error", message: "Authenticated user context is missing." };
    if (!targets.length) return { status: "error", message: "No prospects were supplied." };
    if (!offer) return { status: "error", message: "An offer is required." };

    const connections = await sql`SELECT id, email FROM email_connections WHERE user_id=${userId} AND provider='google' ORDER BY updated_at DESC LIMIT 1`;
    const connection = connections[0] as { id: string; email: string } | undefined;
    if (!connection) return { status: "not_connected", message: "Connect Gmail in Plugins before asking me to send proposal emails." };

    const sent: Array<{ creator: string; email: string; subject: string; message_id: string }> = [];
    const skipped: Array<{ creator: string; reason: string; sources?: { title: string; url: string }[] }> = [];
    const failed: Array<{ creator: string; email?: string; reason: string }> = [];

    for (const target of targets) {
      const name = clean(target.name) || "Creator";
      try {
        const contact = await findContact(name);
        if (!contact.email) {
          skipped.push({ creator: name, reason: contact.status === "not_configured" ? "Public contact research is not configured." : "No public business/contact email was found.", sources: contact.sources.map((s) => ({ title: s.title, url: s.url })) });
          continue;
        }

        const research = [
          `YouTube creator: ${name}`,
          target.country ? `Country: ${target.country}` : "",
          target.subscribers ? `Subscribers: ${target.subscribers}` : "",
          target.total_views ? `Total views: ${target.total_views}` : "",
          target.niche ? `Niche: ${target.niche}` : "",
          target.channel_url ? `Channel: ${target.channel_url}` : "",
          target.description ? `Channel description: ${target.description}` : "",
          `Public contact research found: ${contact.email}`,
        ].filter(Boolean).join("\n");

        const prompt = `Write a concise, personalized website proposal email for a YouTube creator. Return ONLY the email with a Subject: line followed by the body. Do not claim you literally watched a video; say you came across/reviewed their YouTube channel using the supplied research. Mention that the sender is a web developer, noticed the creator has a significant audience and no website is visible in the supplied YouTube research, and offer to build a professional website and send a demo for review. Keep the tone human, respectful, specific, and low-pressure. Do not invent facts, pricing, clients, guarantees, or contact details.\n\nCreator research:\n${research}\n\nOffer: ${offer}\nSender: ${senderName}`;
        const result = await getProvider().chat([
          { role: "system", content: "You are a senior B2B outreach copywriter. Personalize only from evidence. Never fabricate familiarity or facts." },
          { role: "user", content: prompt },
        ] as ChatMessage[]);
        if (!result.text) throw new Error("Email generation returned an empty response.");

        const subjectMatch = result.text.match(/^Subject:\s*(.+)$/im);
        const subject = subjectMatch?.[1]?.trim() || `Website proposal for ${name}`;
        const body = result.text.replace(/^Subject:\s*.+\n?/im, "").trim();
        const sentResult = await sendGmailMessage(userId, connection.id, { to: contact.email, subject, body });
        sent.push({ creator: name, email: contact.email, subject, message_id: sentResult.id });
      } catch (error) {
        failed.push({ creator: name, reason: error instanceof Error ? error.message : "Unable to send proposal email." });
      }
    }

    return {
      status: "completed",
      sender: connection.email,
      sent_count: sent.length,
      skipped_count: skipped.length,
      failed_count: failed.length,
      sent,
      skipped,
      failed,
      note: "Only public business/contact emails found through web research were used. Prospects without a public contact email were skipped rather than guessed.",
    };
  },
};
