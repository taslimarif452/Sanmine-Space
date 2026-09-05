import { sendGmailForUser } from "@/lib/email/gmail-sender";
import type { AgentTool } from "@/lib/agent/tools/types";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export const sendEmailTool: AgentTool = {
  name: "send_email",
  description: "Send a normal email to the exact recipient requested by the authenticated user. Use this tool for direct email requests that are not specifically a proposal/outreach campaign and are not a test email. The `to` argument is the recipient and MUST be the address requested by the user; NEVER replace it with the connected Gmail account. The connected Gmail account is only the sender. Never invent or substitute a recipient address. If the user has not provided a recipient email address, do not guess it; ask for the address or use a verified address already present in the conversation/research.",
  parameters: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Authenticated Sanmine user id." },
      user_email: { type: "string", description: "Authenticated user's email, used only to resolve the sender connection." },
      to: { type: "string", description: "Exact recipient email address. Never use the sender address unless the user explicitly asked to email themselves." },
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["user_id", "to", "subject", "body"],
  },
  execute: async (args) => {
    const userId = clean(args.user_id);
    const userEmail = clean(args.user_email).toLowerCase();
    const to = clean(args.to).toLowerCase();
    const subject = clean(args.subject);
    const body = clean(args.body);

    if (!userId) return { status: "error", message: "Authenticated user context is missing." };
    if (!/^\S+@\S+\.\S+$/.test(to)) return { status: "error", message: "A valid recipient email address is required. Do not guess the recipient." };
    if (!subject) return { status: "error", message: "Email subject is required." };
    if (!body) return { status: "error", message: "Email body is required." };

    try {
      const result = await sendGmailForUser(userId, userEmail, { to, subject, body });
      if (result.status === "needs_connection") return result;
      return {
        status: "sent",
        sent: true,
        to,
        from: result.from,
        subject,
        message_id: result.id,
        thread_id: result.threadId,
        message: `Email sent successfully to ${to}.`,
      };
    } catch (error) {
      console.error("send_email failed", error);
      return { status: "error", sent: false, to, message: error instanceof Error ? error.message : "Email send failed." };
    }
  },
};
