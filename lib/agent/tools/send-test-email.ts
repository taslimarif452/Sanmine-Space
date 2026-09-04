import { sql } from "@/lib/db/neon";
import { sendGmailMessage } from "@/lib/email/gmail";
import { ensureProductionSchema } from "@/lib/agent/production";
import type { AgentTool } from "@/lib/agent/tools/types";

export const sendTestEmailTool: AgentTool = {
  name: "send_test_email",
  description: "Send a harmless test email when the user explicitly asks to test email sending or asks for a simple test email. It uses the connected Gmail account and sends the test message to that same connected Gmail address. This is separate from creator/prospect outreach and must not require a creator list.",
  parameters: { type: "object", properties: { user_id: { type: "string" }, message: { type: "string" } }, required: ["user_id"] },
  execute: async (args) => {
    const userId = typeof args.user_id === "string" ? args.user_id.trim() : "";
    if (!userId) return { status: "error", message: "Authenticated user context is missing." };

    await ensureProductionSchema();
    const rows = await sql`SELECT id, provider, email FROM email_connections WHERE user_id=${userId} AND provider='google' ORDER BY updated_at DESC LIMIT 1`;
    const gmail = rows[0] as { id: string; provider: string; email: string } | undefined;
    if (!gmail) {
      return {
        status: "needs_connection",
        message: "Gmail is not connected. Connect Gmail from Plugins before sending a test email.",
      };
    }

    const message = typeof args.message === "string" && args.message.trim() ? args.message.trim().slice(0, 2000) : "Hi";
    const result = await sendGmailMessage(userId, gmail.id, {
      to: gmail.email,
      subject: "Sanmine Space email test",
      body: message,
    });

    return {
      status: "sent",
      to: gmail.email,
      from: result.from,
      message_id: result.id,
      message: "Test email sent successfully to the connected Gmail address.",
    };
  },
};
