import { sql } from "@/lib/db/neon";
import { decryptToken, encryptToken } from "@/lib/email/oauth";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

type Connection = {
  id: string;
  user_id: string;
  provider: string;
  email: string;
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number | string | null;
};

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function refresh(connection: Connection) {
  if (!connection.refresh_token) throw new Error("Gmail authorization has expired. Please reconnect Gmail from Plugins.");
  const clientId = env("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = env("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Google email OAuth is not configured.");

  const refreshToken = decryptToken(String(connection.refresh_token));
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(String(data.error_description || data.error || "Unable to refresh Gmail authorization."));

  const accessToken = String(data.access_token);
  const expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  await sql`UPDATE email_connections SET access_token=${encryptToken(accessToken)}, expires_at=${expiresAt}, updated_at=NOW() WHERE id=${connection.id} AND user_id=${connection.user_id}`;
  return accessToken;
}

/** Resolve only a Gmail connection belonging to the authenticated Firebase user. */
export async function resolveGmailConnection(userId: string, userEmail?: string) {
  const uid = userId.trim();
  if (!uid) throw new Error("Authenticated user context is missing.");
  const email = (userEmail || "").trim().toLowerCase();

  const rows = email
    ? await sql`SELECT id,user_id,provider,email,access_token,refresh_token,expires_at FROM email_connections WHERE (user_id=${uid} OR (LOWER(TRIM(email))=${email} AND user_id=${uid})) AND LOWER(TRIM(provider)) IN ('google','gmail') ORDER BY updated_at DESC LIMIT 1`
    : await sql`SELECT id,user_id,provider,email,access_token,refresh_token,expires_at FROM email_connections WHERE user_id=${uid} AND LOWER(TRIM(provider)) IN ('google','gmail') ORDER BY updated_at DESC LIMIT 1`;

  const connection = rows[0] as Connection | undefined;
  if (!connection) return null;
  return connection;
}

export async function sendGmailForUser(userId: string, userEmail: string | undefined, input: { to: string; subject: string; body: string }) {
  const to = cleanHeader(input.to);
  const subject = cleanHeader(input.subject);
  const body = String(input.body || "").trim();
  if (!/^\S+@\S+\.\S+$/.test(to)) throw new Error("A valid recipient email is required.");
  if (!subject) throw new Error("Email subject is required.");
  if (!body) throw new Error("Email body is required.");

  const connection = await resolveGmailConnection(userId, userEmail);
  if (!connection) return { status: "needs_connection" as const, connected: false, message: "Gmail is not connected for this signed-in account. Connect Gmail from Plugins before sending." };

  let accessToken: string;
  try {
    accessToken = Number(connection.expires_at || 0) > Date.now() + 60_000
      ? decryptToken(String(connection.access_token))
      : await refresh(connection);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Unable to authorize Gmail.");
  }

  const from = cleanHeader(String(connection.email));
  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body.replace(/\r\n/g, "\n"),
  ].join("\r\n");

  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(raw) }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(data?.error?.message || data?.error_description || "Gmail failed to send the message.");
    throw new Error(detail);
  }
  return { status: "sent" as const, connected: true, id: String(data.id || ""), threadId: data.threadId ? String(data.threadId) : null, from };
}
