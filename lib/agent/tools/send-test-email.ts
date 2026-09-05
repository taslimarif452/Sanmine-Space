import { resolveGmailConnection, sendGmailForUser } from "@/lib/email/gmail-sender";
import { ensureProductionSchema } from "@/lib/agent/production";
import { sql } from "@/lib/db/neon";
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
        (${input.userId}, ${approval[0]?.id || null}, ${input.recipient}, 'sent', ${input.providerMessageId || null}, ${input.providerThreadId || null}, ${JSON.stringify({ source: "agent_test_email" })}::jsonb)
    `;
  } catch (eventError) {
    console.error("Test email event logging warning:", eventError);
  }
}

export const sendTestEmailTool: AgentTool = {
  name: "send_test_email",
  description: "Send a test email. If the user provides an explicit recipient address, ALWAYS send to that exact address; never replace it with the connected Gmail account. Only when no recipient is provided may this tool send the test to the connected Gmail address itself.",
  parameters: {
    type: "object",
    properties: {
      user_id: { type: "string" },
      user_email: { type: "string" },
      to: { type: "string", description: "Explicit recipient. If present, this exact address must be used." },
      subject: { type: "string", description: "Optional subject." },
      message: { type: "string", description: "Email body." },
    },
    required: ["user_id"],
  },
  execute: async (args) => {
    const userId = clean(args.user_id);
    const userEmail = clean(args.user_email).toLowerCase();
    if (!userId) return { status: "error", message: "Authenticated user context is missing." };

    try {
      const connection = await resolveGmailConnection(userId, userEmail);
      if (!connection) return { status: "needs_connection", connected: false, message: "Gmail is not connected for this signed-in account. Connect Gmail from Plugins before sending." };

      const requestedRecipient = clean(args.to).toLowerCase();
      const recipient = requestedRecipient || connection.email;
      if (!/^\S+@\S+\.\S+$/.test(recipient)) return { status: "error", message: "A valid recipient email address is required." };

      const message = clean(args.message) || "Hi";
      const subject = clean(args.subject) || "Sanmine Space email test";
      const result = await sendGmailForUser(userId, userEmail, {
        to: recipient,
        subject,
        body: message.slice(0, 12000),
      });
      if (result.status === "needs_connection") return result;

      // Sent-email history belongs to the account, not to the chat that triggered it.
      try {
        await recordSentEmail({
          userId,
          connectionId: connection.id,
          recipient,
          subject,
          body: message.slice(0, 12000),
          providerMessageId: result.id,
          providerThreadId: result.threadId,
        });
      } catch (logError) {
        console.error("Test sent-email persistence warning:", logError);
      }

      return {
        status: "sent",
        connected: true,
        to: recipient,
        from: result.from,
        message_id: result.id,
        thread_id: result.threadId,
        message: `Test email was successfully sent to ${recipient}.`,
      };
    } catch (error) {
      console.error("send_test_email failed", error);
      return { status: "error", connected: true, message: error instanceof Error ? error.message : "Test email send failed." };
    }
  },
};
