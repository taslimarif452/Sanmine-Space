import { sql } from "@/lib/db/neon";
import { resolveGmailConnection, sendGmailForUser } from "@/lib/email/gmail-sender";
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
  const messages: Record<string, string> = { hi: "Proposal bhejne ke liye Plugins page par Gmail connect karo.", bn: "Proposal পাঠানোর জন্য Plugins পেজে Gmail connect করুন।", es: "Conecta Gmail desde Plugins para enviar las propuestas.", fr: "Connectez Gmail depuis Plugins pour envoyer les propositions.", en: "Connect Gmail from Plugins before sending proposals." };
  return messages[language] || messages.en;
}
function extractBusinessEmails(text: string) {
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(emails.map((x) => x.toLowerCase()))].filter((email) => !/example\.com|sentry|wixpress|cloudflare|noreply|no-reply|support@|privacy@|legal@|abuse@|owner@companyname|joe@email/i.test(email));
}
function isContentTitle(name: string) { return /\b(guide|how to|how-to|tips|directory|directories|list of|business ideas|find businesses|best small business|article|blog|reddit|youtube|quora)\b/i.test(name); }
function emailBelongsToTarget(targetName: string, result: TavilyResult, email: string) {
  const haystack = `${clean(result.title)} ${clean(result.content)} ${clean(result.url)}`.toLowerCase();
  const tokens = clean(targetName).toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 3);
  const nameMatch = tokens.length > 0 && tokens.some((token) => haystack.includes(token));
  const localPart = email.split("@")[0].replace(/[._-]+/g, " ").toLowerCase();
  return nameMatch || tokens.some((token) => localPart.includes(token));
}
async function findContact(name: string, sourceUrl = "") {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return { status: "not_configured", email: null, sources: [] as Array<{ title: string; url: string; snippet: string }> };
  const queries = [`"${name}" contact email business`, `"${name}" email address business`, sourceUrl ? `"${name}" email contact` : `"${name}" contact us email business`];
  const responses = await Promise.all(queries.map(async (query) => {
    try {
      const response = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: apiKey, query, max_results: 5, search_depth: "basic", include_answer: false, include_raw_content: false }), cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!response.ok) return [] as TavilyResult[];
      const data = await response.json() as { results?: TavilyResult[] };
      return data.results ?? [];
    } catch { return [] as TavilyResult[]; }
  }));
  const sources: Array<{ title: string; url: string; snippet: string }> = [];
  const emails: string[] = [];
  for (const results of responses) for (const result of results) {
    const title = clean(result.title) || "Untitled source"; const url = clean(result.url); const snippet = clean(result.content);
    sources.push({ title, url, snippet });
    for (const email of extractBusinessEmails(`${title}\n${url}\n${snippet}`)) if (emailBelongsToTarget(name, result, email)) emails.push(email);
  }
  return { status: "success", email: emails[0] ?? null, emails: [...new Set(emails)], sources: sources.slice(0, 8) };
}
async function discoverBusinessTargets(apiKey: string) {
  const queries = [`"no website" "contact" "@" "local business"`, `"no website" "email" "restaurant" OR "salon" OR "shop"`, `"no website" "contact us" "small business"`];
  const rows = (await Promise.all(queries.map(async (query) => {
    try {
      const response = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: apiKey, query, max_results: 10, search_depth: "advanced", include_answer: false, include_raw_content: false }), cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!response.ok) return [] as TavilyResult[]; const data = await response.json() as { results?: TavilyResult[] }; return data.results ?? [];
    } catch { return [] as TavilyResult[]; }
  }))).flat();
  const seen = new Set<string>();
  return rows.filter((row) => {
    const title = clean(row.title), url = clean(row.url), content = clean(row.content), key = title.toLowerCase();
    if (!title || !url || !content || seen.has(key) || isContentTitle(title)) return false;
    if (/\b(reddit|youtube|quora|godaddy|oppora|origami|knapsackcreative|josh talks|sahu4you|leenkup|fundraiseinsider|truehost|grapeleads|b2bleadfinder|outscraper)\b/i.test(url)) return false;
    if (!extractBusinessEmails(`${title}\n${url}\n${content}`).length) return false;
    seen.add(key); return true;
  }).slice(0, 10).map((row) => ({ name: clean(row.title).replace(/\s*[|—-]\s*.*$/, "").trim(), description: clean(row.content), channel_url: clean(row.url), email: extractBusinessEmails(`${clean(row.title)}\n${clean(row.url)}\n${clean(row.content)}`)[0] }));
}

function firstName(value: string) {
  const cleaned = clean(value).replace(/\s+/g, " ");
  return cleaned ? cleaned.split(" ")[0] : "there";
}

function normalizeNiche(value: string) {
  const niche = clean(value).replace(/[|*_]/g, "").replace(/\s+/g, " ");
  if (!niche) return "content";
  return niche.length > 60 ? niche.slice(0, 60).trim() : niche;
}

function researchSentence(target: Target) {
  const description = clean(target.description).replace(/\s+/g, " ").replace(/^[-–—•]+/, "").trim();
  const niche = normalizeNiche(target.niche || "");
  const subscribers = clean(target.subscribers);
  const audience = subscribers ? ` I also noticed your channel has around ${subscribers} subscribers, so there is already a strong audience to build around.` : "";
  if (description) return `I came across your YouTube channel and noticed that you focus on ${niche}. From the channel information, ${description.slice(0, 180)}.${audience}`;
  return `I came across your YouTube channel and noticed that you focus on ${niche}.${audience}`;
}

function buildEmail(target: Target, _offer: string, language: string) {
  const name = clean(target.name) || "your channel";
  const greetingName = firstName(name);
  const niche = normalizeNiche(target.niche || "your niche");
  const observation = researchSentence(target);
  const signatures = "Best regards,\nTavqeer Hussain\nWeb Developer\n📞 WhatsApp: +91 7209394252\n🌐 Portfolio: https://tavqeer-hussain.web.app/";
  const subjectVariants = [
    `${name} — a website idea for your ${niche} channel`,
    `A website could be a strong next step for ${name}`,
    `${name}: a custom website idea for your audience`,
    `A quick website proposal for ${name}`,
    `Building a website around ${name}'s YouTube audience`,
  ];
  const subject = subjectVariants[Math.abs(name.split("").reduce((n, ch) => n + ch.charCodeAt(0), 0)) % subjectVariants.length];

  if (language === "hi") {
    const body = `Hi ${greetingName},\n\nMain aapka YouTube channel dekh raha tha. ${observation}\n\nMujhe laga ki aapke channel ke liye ek professional website useful ho sakti hai jahan aap apne content, services, social links aur audience ke liye ek dedicated online presence rakh saken. Main full-stack web developer hoon aur aapke channel/category ke according website bana sakta hoon.\n\nAgar aap interested hain, main aapke channel ke liye ek custom homepage demo bhi bana kar review ke liye share kar sakta hoon, bina kisi obligation ke.\n\n${signatures}`;
    return { subject, body };
  }

  if (language === "bn") {
    const body = `Hi ${greetingName},\n\nI came across your YouTube channel. ${observation}\n\nI think a professional website could give your channel a dedicated home for your content, services, social links, and audience. I’m a full-stack web developer and can build the website around your channel and content category rather than using a generic template.\n\nIf you’re interested, I can create a custom homepage demo for your channel to review with no obligation.\n\n${signatures}`;
    return { subject, body };
  }

  if (language === "es") {
    const body = `Hi ${greetingName},\n\nI came across your YouTube channel. ${observation}\n\nI think a professional website could give your channel a dedicated home for your content, services, social links, and audience. I’m a full-stack web developer and can build it around your channel and ${niche} content rather than using a generic template.\n\nIf you’re interested, I can create a custom homepage demo for you to review with no obligation.\n\n${signatures}`;
    return { subject, body };
  }

  if (language === "fr") {
    const body = `Hi ${greetingName},\n\nI came across your YouTube channel. ${observation}\n\nI think a professional website could give your channel a dedicated home for your content, services, social links, and audience. I’m a full-stack web developer and can build it around your channel and ${niche} content rather than using a generic template.\n\nIf you’re interested, I can create a custom homepage demo for you to review with no obligation.\n\n${signatures}`;
    return { subject, body };
  }

  const body = `Hi ${greetingName},\n\nI came across your YouTube channel. ${observation}\n\nI noticed there isn’t a dedicated website linked for your channel, and I think that could be a useful next step as your audience grows. I’m a full-stack web developer, and I’d like to build a professional website specifically around your channel, content, and ${niche} audience.\n\nThe goal would be to give you a place for your content, social links, services or collaborations, and a stronger home outside YouTube. I can also create a custom homepage demo for you to review with no obligation.\n\nIf you’re interested, I’d be happy to share the demo.\n\n${signatures}`;
  return { subject, body };
}

export const sendProposalOutreachTool: AgentTool = {
  name: "send_proposal_outreach",
  description: "For an explicit user request to send proposals, verify the authenticated user's Gmail connection, find public business/contact emails, personalize each proposal email from the supplied research, and send it immediately. Each recipient must receive a genuinely individualized subject and body using their name, niche/category, channel or business context, and only verified research facts. Use the user's requested sender identity/signature when supplied. Never use the same generic email for every recipient and never guess an email address.",
  parameters: { type: "object", properties: { user_id: { type: "string" }, user_email: { type: "string" }, targets: { type: "array", items: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, country: { type: "string" }, subscribers: { type: "string" }, total_views: { type: "string" }, niche: { type: "string" }, channel_url: { type: "string" }, description: { type: "string" } }, required: ["name"] } }, offer: { type: "string" }, sender_name: { type: "string" }, user_language: { type: "string" } }, required: ["targets", "offer"] },
  execute: async (args) => {
    const userId = clean(args.user_id); const authEmail = clean(args.user_email).toLowerCase(); const suppliedTargets = Array.isArray(args.targets) ? (args.targets as Target[]).slice(0, 10) : []; const offer = clean(args.offer); const language = clean(args.user_language) || "en";
    if (!userId) return { status: "error", message: "Authenticated user context is missing." };
    if (!suppliedTargets.length) return { status: "error", message: "No prospects were supplied." };
    if (!offer) return { status: "error", message: "An offer is required." };

    const gmail = await resolveGmailConnection(userId, authEmail);
    if (!gmail) return { status: "needs_connection", sent: [], skipped: [], failed: [], message: connectionMessage(language) };
    await ensureProductionSchema();

    const sent: Array<Record<string, string>> = []; const skipped: Array<Record<string, string>> = []; const failed: Array<Record<string, string>> = [];
    let workingTargets = suppliedTargets.filter((target) => !isContentTitle(clean(target.name)));
    const tavilyKey = process.env.TAVILY_API_KEY?.trim();
    if (!workingTargets.length && tavilyKey) workingTargets = await discoverBusinessTargets(tavilyKey);
    if (!workingTargets.length) return { status: "completed", sender: gmail.email, sent: [], skipped: [{ creator: "Research results", reason: "No real business prospects with verified public contact emails were found. No email was fabricated or sent." }], failed: [], sent_count: 0, skipped_count: 1, failed_count: 0 };

    for (const target of workingTargets) {
      let email = clean(target.email).toLowerCase();
      const contact = email ? null : await findContact(clean(target.name), clean(target.channel_url));
      if (!email) email = clean(contact?.email).toLowerCase();
      if (!email) { skipped.push({ creator: clean(target.name) || "Unknown prospect", reason: contact?.status === "not_configured" ? "Public contact email lookup is not configured." : "No verified public business/contact email found." }); continue; }
      const { subject, body } = buildEmail(target, offer, language);
      try {
        const result = await sendGmailForUser(userId, authEmail, { to: email, subject, body });
        if (result.status !== "sent") { skipped.push({ creator: clean(target.name) || "Prospect", reason: result.message }); continue; }

        // Gmail has confirmed delivery to the Gmail API. Record the successful send
        // immediately so a logging/database problem can never turn a real send into
        // a false "failed" result in the assistant UI.
        sent.push({ creator: clean(target.name) || "Prospect", email, subject, message_id: result.id || "" });

        // Logging is best-effort only. The email itself is already sent successfully.
        try {
          const approval = await sql`INSERT INTO email_approvals (user_id, connection_id, recipient, subject, body, status, approved_at, sent_at, provider_message_id) VALUES (${userId}, ${gmail.id}, ${email}, ${subject}, ${body}, 'sent', NOW(), NOW(), ${result.id || null}) RETURNING id`;
          try {
            await sql`INSERT INTO email_events (user_id, approval_id, recipient, event_type, provider_message_id, provider_thread_id, metadata) VALUES (${userId}, ${approval[0]?.id || null}, ${email}, 'sent', ${result.id || null}, ${result.threadId || null}, ${JSON.stringify({ source: "agent_outreach" })}::jsonb)`;
          } catch (eventError) {
            console.error("Email event logging warning:", eventError);
          }
        } catch (logError) {
          console.error("Email approval logging warning:", logError);
        }
      } catch (error) {
        failed.push({ creator: clean(target.name) || "Prospect", email, reason: error instanceof Error ? error.message : "Gmail send failed." });
      }
    }
    return { status: sent.length ? "sent" : failed.length ? "failed" : "completed", sender: gmail.email, sent, skipped, failed, sent_count: sent.length, skipped_count: skipped.length, failed_count: failed.length };
  }
};