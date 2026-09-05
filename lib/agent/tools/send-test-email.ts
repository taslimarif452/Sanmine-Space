import { resolveGmailConnection, sendGmailForUser } from "@/lib/email/gmail-sender";
import type { AgentTool } from "@/lib/agent/tools/types";

export const sendTestEmailTool: AgentTool = {
  name: "send_test_email",
  description: "Send a harmless test email when the user explicitly asks to test email sending or asks for a simple test email. Send it to the connected Gmail account itself. Never require a creator or prospect research list.",
  parameters: {
    type: "object",
    properties: {
      user_id: { type: "string" },
      user_email: { type: "string" },
      message: { type: "string" },
    },
    required: ["user_id"],
  },
  execute: async (args) => {
    const userId = typeof args.user_id === "string" ? args.user_id.trim() : "";
    const userEmail = typeof args.user_email === "string" ? args.user_email.trim().toLowerCase() : "";
    if (!userId) return { status: "error", message: "Authenticated user context is missing." };

    try {
      const connection = await resolveGmailConnection(userId, userEmail);
      if (!connection) return { status: "needs_connection", connected: false, message: "Gmail is not connected for this signed-in account. Connect Gmail from Plugins before sending." };
      const message = typeof args.message === "string" && args.message.trim() ? args.message.trim().slice(0, 2000) : "Hi";
      const result = await sendGmailForUser(userId, userEmail, {
        to: connection.email,
        subject: "Sanmine Space email test",
        body: message,
      });
      if (result.status === "needs_connection") return result;
      return { status: "sent", connected: true, to: result.from, from: result.from, message_id: result.id, message: "Test email sent successfully to the connected Gmail address." };
    } catch (error) {
      console.error("send_test_email failed", error);
      return { status: "error", connected: true, message: error instanceof Error ? error.message : "Test email send failed." };
    }
  },
};
