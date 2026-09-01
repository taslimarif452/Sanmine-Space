import { getProvider, type ChatMessage } from "@/lib/ai/provider";
import type { AgentTool } from "@/lib/agent/tools/types";

function text(args: Record<string, unknown>, key: string, fallback = "") {
  const value = args[key];
  return typeof value === "string" ? value.trim() : fallback;
}

export const generateEmailTool: AgentTool = {
  name: "generate_outreach_email",
  description: "Generate a personalized cold outreach, follow-up, introduction, or sales email using lead/company research and a clear call to action. Use this when the user asks to write an email to a prospect or client.",
  parameters: {
    type: "object",
    properties: {
      recipient_name: { type: "string", description: "Recipient name, if known." },
      company: { type: "string", description: "Prospect company." },
      role: { type: "string", description: "Recipient role, if known." },
      purpose: { type: "string", description: "Purpose of the email: cold outreach, follow-up, intro, proposal follow-up, etc." },
      offer: { type: "string", description: "Relevant service or offer." },
      pain_point: { type: "string", description: "Specific problem or opportunity identified from research." },
      research: { type: "string", description: "Website/research/lead context used for personalization." },
      call_to_action: { type: "string", description: "Desired next step." },
      tone: { type: "string", description: "Tone such as concise, professional, friendly, or consultative." },
      extra: { type: "string", description: "Additional constraints or instructions." }
    },
    required: ["offer"]
  },
  execute: async (args) => {
    const recipient = text(args, "recipient_name", "there");
    const company = text(args, "company", "the company");
    const role = text(args, "role");
    const purpose = text(args, "purpose", "cold outreach");
    const offer = text(args, "offer");
    const pain = text(args, "pain_point");
    const research = text(args, "research");
    const cta = text(args, "call_to_action", "Would you be open to a quick conversation?");
    const tone = text(args, "tone", "concise, professional, human");
    const extra = text(args, "extra");

    const prompt = `Write a personalized B2B ${purpose} email. Return ONLY the email, including a subject line and body. Keep it concise and natural (roughly 80–160 words unless the context requires otherwise). Do not use fake compliments, invented facts, fake statistics, fake familiarity, or unsupported claims. Use only the supplied research. If a key fact is missing, write around it instead of inventing it. Avoid spammy language and excessive formatting. Make the CTA specific and low-friction.

Recipient: ${recipient}
Company: ${company}
Role: ${role || "Unknown"}
Offer: ${offer}
Pain point/opportunity: ${pain || "Not specified"}
Research/context: ${research || "None provided"}
CTA: ${cta}
Tone: ${tone}
Extra instructions: ${extra || "None"}`;

    const messages: ChatMessage[] = [
      { role: "system", content: "You are a senior B2B outreach copywriter for Sanmine Space. Personalize from evidence, stay concise, and never fabricate facts." },
      { role: "user", content: prompt }
    ];
    const result = await getProvider().chat(messages);
    if (!result.text) throw new Error("Email generator returned an empty response.");
    return { status: "generated", type: "email", content: result.text };
  }
};
