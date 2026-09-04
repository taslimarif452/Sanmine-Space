import { sql } from "@/lib/db/neon";
import { sendGmailMessage } from "@/lib/email/gmail";
import { ensureProductionSchema } from "@/lib/agent/production";
import type { AgentTool } from "@/lib/agent/tools/types";

export const sendTestEmailTool: AgentTool = {
  name: "send_test_email",
  description: "Send a harmless test email when the user explicitly asks to test email sending or asks for a simple test email. It uses the connected Gmail account and sends the test message to that same connected Gmail address. This is separate from creator/prospect outreach and must not require a creator list.",
  parameters: { type: "object", properties: { user_id: { type: "string" }, user_email: { type: "string" }, message: { type: "string" } }, required: ["user_id"] },
  execute: async (args) => {
    const userId = typeof args.user_id === "string" ? args.user_id.trim() : "";
    const authEmail = typeof args.user_email === "string" ? args.user_email.trim().toLowerCase() : "";
    if (!userId) return { status: "error", message: "Authenticated user context is missing." };

    try {
      await ensureProductionSchema();

      // Resolve the mailbox using the authenticated Firebase UID first. The email
      // fallback is important for connections created by an older deployment where
      // the connection row may have been associated with a stale account identifier.
      const userRows = await sql`SELECT email FROM users WHERE id=${userId} LIMIT 1`;
      const userEmail = authEmail || String((userRows[0] as any)?.email || "").trim().toLowerCase();
      const rows = userEmail
        ? await sql`SELECT id, provider, email, expires_at FROM email_connections WHERE provider='google' AND (user_id=${userId} OR LOWER(email)=${userEmail}) ORDER BY CASE WHEN user_id=${userId} THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`
        : await sql`SELECT id, provider, email, expires_at FROM email_connections WHERE user_id=${userId} AND provider='google' ORDER BY updated_at DESC LIMIT 1`;
      const gmail = rows[0] as { id: string; provider: string; email: string; expires_at?: number | string | null } | undefined;
      if (!gmail) {
        return {
          status: "needs_connection",
          connected: false,
          message: "Gmail is not connected for this signed-in account. Connect Gmail from Plugins before sending a test email.",
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
        connected: true,
        to: gmail.email,
        from: result.from,
        message_id: result.id,
        message: "Test email sent successfully to the connected Gmail address.",
      };
    } catch (error) {
      console.error("send_test_email failed", error);
      return {
        status: "error",
        connected: false,
        message: error instanceof Error ? error.message : "Test email send failed.",
      };
    }
  },
};
