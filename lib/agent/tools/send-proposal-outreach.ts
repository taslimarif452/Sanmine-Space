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

function connectionMessage(language: string) {
  const messages: Record<string, string> = {
    hi: "Proposal bhejne se pehle pehle Plugins page par jaakar Gmail connect karo. Abhi Sanmine Space me Gmail sending active hai; Outlook sending abhi available nahi hai. Connection ke baad mujhe phir se send karne ko bolo, tab main research → personalized proposal → email send workflow chala dunga.",
    bn: "Proposal পাঠানোর আগে Plugins পেজে গিয়ে Gmail connect করুন। এখন Sanmine Space-এ Gmail sending active; Outlook sending এখনও available নয়। Connect করার পরে আবার send করতে বলুন, তারপর আমি research → personalized proposal → email send workflow চালাব।",
    es: "Antes de enviar las propuestas, ve a la página Plugins y conecta Gmail. Ahora mismo Sanmine Space tiene activo el envío por Gmail; Outlook todavía no está disponible. Después de conectarlo, vuelve a pedirme que las envíe y ejecutaré el flujo de investigación → propuesta personalizada → envío.",
    fr: "Avant d'envoyer les propositions, allez dans la page Plugins et connectez Gmail. Pour le moment, l'envoi Gmail est actif dans Sanmine Space ; Outlook n'est pas encore disponible. Après la connexion, demandez-moi à nouveau de les envoyer et j'exécuterai le flux recherche → proposition personnalisée → envoi.",
    zh: "发送提案前，请先进入 Plugins 页面并连接 Gmail。目前 Sanmine Space 已启用 Gmail 发送，Outlook 发送暂不可用。连接后再次让我发送，我会执行研究 → 个性化提案 → 邮件发送流程。",
    ja: "提案を送信する前に、Plugins ページで Gmail を接続してください。現在 Sanmine Space では Gmail 送信が有効で、Outlook 送信はまだ利用できません。接続後にもう一度送信を依頼すると、調査 → パーソナライズ提案 → メール送信の流れを実行します。",
    ko: "제안서를 보내기 전에 Plugins 페이지에서 Gmail을 연결해 주세요. 현재 Sanmine Space에서는 Gmail 전송이 활성화되어 있으며 Outlook 전송은 아직 사용할 수 없습니다. 연결한 후 다시 보내달라고 하면 조사 → 개인화 제안서 → 이메일 전송 흐름을 실행합니다.",
    en: "Before I can send the proposals, please go to the Plugins page and connect Gmail. Gmail sending is currently active in Sanmine Space; Outlook sending is not available yet. After connecting, ask me to send them again and I will run the research → personalized proposal → email send workflow.",
  };
  return messages[language] || messages.en;
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
  description: "For an explicit request to send website/service proposals by email, first verify that a supported email provider is connected. If none is connected, stop before researching contacts and tell the user in the same language to connect Gmail from Plugins. If Gmail is connected, research public business contact emails, personalize each proposal from the supplied research, and send it through Gmail. Never guess an email address. Draft-only requests must not call this tool.",
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
      user_language: { type: "string", description: "Language of the user's latest request, used for connection/error messaging." },
    },
    required: ["targets", "offer"],
  },
  execute: async (args) => {
    const userId = clean(args.user_id);
    const targets = Array.isArray(args.targets) ? (args.targets as Target[]).slice(0, 20) : [];
    const offer = clean(args.offer);
    const senderName = clean(args.sender_name) || "Sanmine Space";
    const language = clean(args.user_language) || "en";
    if (!userId) return { status: "error", message: "Authenticated user context is missing." };
    if (!targets.length) return { status: "error", message: "No prospects were supplied." };
    if (!offer) return { status: "error", message: "An offer is required." };

    // Provider preflight happens before contact research. This prevents the
    // agent from doing expensive research and, more importantly, prevents any
    // implication that an email can be sent when no sending account exists.
    const connections = await sql`SELECT id, provider, email FROM email_connections WHERE user_id=${userId} ORDER BY updated_at DESC`;
    const gmail = connections.find((row) => String((row as any).provider) === "google") as { id: string; provider: string; email: string } | undefined;
    const microsoft = connections.find((row) => String((row as any).provider) === "microsoft") as { id: string; provider: string; email: string } | undefined;

    if (!gmail && !microsoft) {
      return {
        status: "needs_connection",
        sent_count: 0,
        skipped_count: 0,
        failed_count: 0,
        connected_providers: [],
        message: connectionMessage(language),
      };
    }

    // Outlook records may exist in the schema, but its OAuth/send implementation
    // is intentionally disabled in the current product. Never pretend it sent.
    if (!gmail && microsoft) {
      return {
        status: "provider_unavailable",
        sent_count: 0,
        skipped_count: 0,
        failed_count: 0,
        connected_providers: ["microsoft"],
        message: language === "hi"
          ? "Outlook connected hai, lekin Outlook sending abhi Sanmine Space me enabled nahi hai. Plugins me Gmail connect karo, phir proposals send karne ko bolo."
          : "Outlook is connected, but Outlook sending is not enabled in Sanmine Space yet. Connect Gmail from Plugins, then ask me to send the proposals.",
      };
    }

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
        const sentResult = await sendGmailMessage(userId, gmail.id, { to: contact.email, subject, body });
        sent.push({ creator: name, email: contact.email, subject, message_id: sentResult.id });
      } catch (error) {
        failed.push({ creator: name, reason: error instanceof Error ? error.message : "Unable to send proposal email." });
      }
    }

    return {
      status: "completed",
      provider: "google",
      sender: gmail.email,
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
