import { sendGmailForUser, resolveGmailConnection } from "@/lib/email/gmail-sender";
import { ensureProductionSchema } from "@/lib/agent/production";
import { sql } from "@/lib/db/neon";
import { sendProposalOutreachTool } from "@/lib/agent/tools/send-proposal-outreach";
import type { AgentTool } from "@/lib/agent/tools/types";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function recordSentEmail(input: {
  userId: string;
  connectionId: string;
  recipient: string;
  subject: string;
  body: string;
  providerMessageId?: string | null;
  providerThreadId?: string | null;
}) {
  await ensureProductionSchema();
  const approval = await sql`
    INSERT INTO email_approvals
      (user_id, connection_id, recipient, subject, body, status, approved_at, sent_at, provider_message_id)
    VALUES
      (${input.userId}, ${input.connectionId}, ${input.recipient}, ${input.subject}, ${input.body}, 'sent', NOW(), NOW(), ${input.providerMessageId || null})
    RETURNING id
  `;

  try {
    await sql`
      INSERT INTO email_events
        (user_id, approval_id, recipient, event_type, provider_message_id, provider_thread_id, metadata)
      VALUES
        (${input.userId}, ${approval[0]?.id || null}, ${input.recipient}, 'sent', ${input.providerMessageId || null}, ${input.providerThreadId || null}, ${JSON.stringify({ source: "agent_direct_email" })}::jsonb)
    `;
  } catch (eventError) {
    console.error("Direct email event logging warning:", eventError);
  }
}

export const sendEmailTool: AgentTool = {
  name: "send_proposal_outreach",
  description: "Send an email action. For a normal direct email, use `to`, `subject`, and `body` and send to that exact recipient. The connected Gmail account is ONLY the sender and must never replace the requested recipient. Even when the user says the email is for testing, if they provide a recipient address, send to that exact address. Never use the connected account as the recipient when `to` is supplied. For proposal/outreach campaigns, use `targets` and `offer` as before. Never guess or substitute a recipient email.",
  parameters: {
    type: "object",
    properties: {
      user_id: { type: "string" },
      user_email: { type: "string" },
      to: { type: "string", description: "Exact recipient email for a normal direct email. This must be used as the Gmail To address, even for a test." },
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
      const subject = clean(args.subject) || "Sanmine Space test email";
      const body = clean(args.body);
      if (!/^\S+@\S+\.\S+$/.test(to)) return { status: "error", message: "A valid recipient email address is required. Do not guess the recipient." };
      if (!body) return { status: "error", message: "Email body is required." };

      try {
        const result = await sendGmailForUser(userId, userEmail, { to, subject, body });
        if (result.status === "needs_connection") return result;

        // Persist the successful send independently of the chat. Deleting a chat
        // must never remove the sent-email history shown on /emails.
        try {
          const connection = await resolveGmailConnection(userId, userEmail);
          if (connection) {
            await recordSentEmail({
              userId,
              connectionId: connection.id,
              recipient: to,
              subject,
              body,
              providerMessageId: result.id,
              providerThreadId: result.threadId,
            });
          }
        } catch (logError) {
          console.error("Direct sent-email persistence warning:", logError);
        }

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
        console.error("send_email direct mode failed", error);
        return { status: "error", sent: false, to, message: error instanceof Error ? error.message : "Email send failed." };
      }
    }

    return sendProposalOutreachTool.execute(args);
  },
};
