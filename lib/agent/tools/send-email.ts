import { sendGmailForUser } from "@/lib/email/gmail-sender";
import { sendProposalOutreachTool } from "@/lib/agent/tools/send-proposal-outreach";
import type { AgentTool } from "@/lib/agent/tools/types";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export const sendEmailTool: AgentTool = {
  name: "send_proposal_outreach",
  description: "Send an email action. For a normal direct email, use `to`, `subject`, and `body` and send to that exact recipient; the connected Gmail account is ONLY the sender and must never replace the requested recipient. For proposal/outreach campaigns, use `targets` and `offer` as before. Never guess or substitute a recipient email. If a direct recipient email was not provided and cannot be safely recovered from the conversation, do not invent one.",
  parameters: {
    type: "object",
    properties: {
      user_id: { type: "string" },
      user_email: { type: "string" },
      to: { type: "string", description: "Exact recipient email for a normal direct email." },
      subject: { type: "string", description: "Subject for a normal direct email." },
      body: { type: "string", description: "Body for a normal direct email." },
      targets: { type: "array", items: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, country: { type: "string" }, subscribers: { type: "string" }, total_views: { type: "string" }, niche: { type: "string" }, channel_url: { type: "string" }, description: { type: "string" } }, required: ["name"] } },
      offer: { type: "string" },
      sender_name: { type: "string" },
      user_language: { type: "string" },
    },
    required: ["user_id"],
  },
  execute: async (args) => {
    const userId = clean(args.user_id);
    const userEmail = clean(args.user_email).toLowerCase();
    const to = clean(args.to).toLowerCase();

    if (!userId) return { status: "error", message: "Authenticated user context is missing." };

    if (to) {
      const subject = clean(args.subject);
      const body = clean(args.body);
      if (!/^\S+@\S+\.\S+$/.test(to)) return { status: "error", message: "A valid recipient email address is required. Do not guess the recipient." };
      if (!subject) return { status: "error", message: "Email subject is required." };
      if (!body) return { status: "error", message: "Email body is required." };

      try {
        const result = await sendGmailForUser(userId, userEmail, { to, subject, body });
        if (result.status === "needs_connection") return result;
        return { status: "sent", sent: true, to, from: result.from, subject, message_id: result.id, thread_id: result.threadId, message: `Email sent successfully to ${to}.` };
      } catch (error) {
        console.error("send_email direct mode failed", error);
        return { status: "error", sent: false, to, message: error instanceof Error ? error.message : "Email send failed." };
      }
    }

    return sendProposalOutreachTool.execute(args);
  },
};
