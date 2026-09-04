import { decryptToken, encryptToken } from "@/lib/email/oauth";
import { sql } from "@/lib/db/neon";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

function b64url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function headerValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

async function refreshAccessToken(connection: any) {
  if (!connection.refresh_token) throw new Error("Gmail connection has expired and cannot be refreshed. Please reconnect Gmail.");
  const refreshToken = decryptToken(String(connection.refresh_token));
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Google email OAuth is not configured.");
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(String(data.error_description || data.error || "Unable to refresh Gmail access."));
  const accessToken = String(data.access_token);
  const expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  await sql`UPDATE email_connections SET access_token=${encryptToken(accessToken)}, expires_at=${expiresAt}, updated_at=NOW() WHERE id=${connection.id}`;
  return accessToken;
}

export async function getGoogleAccessToken(userId: string, connectionId: string) {
  // The OAuth connection is owned by the authenticated Firebase account. In older
  // deployments some connections were stored against a stale UID, so use the
  // signed-in user's email as a safe second key for the same Google mailbox.
  const userRows = await sql`SELECT email FROM users WHERE id=${userId} LIMIT 1`;
  const userEmail = String((userRows[0] as any)?.email || "").trim().toLowerCase();
  const rows = userEmail
    ? await sql`SELECT id, user_id, provider, email, access_token, refresh_token, expires_at FROM email_connections WHERE id=${connectionId} AND (user_id=${userId} OR LOWER(email)=${userEmail}) LIMIT 1`
    : await sql`SELECT id, user_id, provider, email, access_token, refresh_token, expires_at FROM email_connections WHERE id=${connectionId} AND user_id=${userId} LIMIT 1`;
  const connection = rows[0] as any;
  if (!connection) throw new Error("Email connection not found for the signed-in account.");
  if (connection.provider !== "google") throw new Error("Only Gmail sending is enabled right now.");
  if (Number(connection.expires_at || 0) > Date.now() + 60_000) return { accessToken: decryptToken(String(connection.access_token)), email: String(connection.email) };
  return { accessToken: await refreshAccessToken(connection), email: String(connection.email) };
}

export async function sendGmailMessage(userId: string, connectionId: string, input: { to: string; subject: string; body: string }) {
  const to = headerValue(input.to);
  const subject = headerValue(input.subject);
  const body = input.body.trim();
  if (!/^\S+@\S+\.\S+$/.test(to)) throw new Error("A valid recipient email is required.");
  if (!subject) throw new Error("Email subject is required.");
  if (!body) throw new Error("Email body is required.");
  const { accessToken, email } = await getGoogleAccessToken(userId, connectionId);
  const raw = [
    `From: ${email}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body.replace(/\r\n/g, "\n")
  ].join("\r\n");
  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(raw) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.error?.message || data.error_description || "Gmail failed to send the message."));
  return { id: String(data.id || ""), threadId: data.threadId ? String(data.threadId) : null, from: email };
}
