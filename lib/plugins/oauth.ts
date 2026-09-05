import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db/neon";

export type PluginProvider = "github" | "notion" | "canva" | "discord" | "vercel" | "google-workspace";

type TokenResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  email: string | null;
  name: string | null;
  accountId: string;
  metadata?: Record<string, unknown>;
};

const env = (name: string) => process.env[name]?.trim() || "";
const allowedProviders = new Set<PluginProvider>(["github", "notion", "canva", "discord", "vercel", "google-workspace"]);

export function isPluginProvider(value: string): value is PluginProvider {
  return allowedProviders.has(value as PluginProvider);
}

function secret(name: string) {
  const value = env(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function stateSecret() {
  return secret("OAUTH_STATE_SECRET");
}

export function createPluginState(uid: string, provider: PluginProvider) {
  const payload = Buffer.from(JSON.stringify({ uid, provider, exp: Date.now() + 10 * 60 * 1000, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyPluginState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Invalid OAuth state.");
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid OAuth state signature.");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; provider?: PluginProvider; exp?: number };
  if (!data.uid || !data.provider || !isPluginProvider(data.provider) || !data.exp || data.exp < Date.now()) throw new Error("OAuth state expired or invalid.");
  return data;
}

function encryptionKey() {
  return createHmac("sha256", secret("OAUTH_TOKEN_ENCRYPTION_KEY")).update("sanmine-plugin-tokens").digest();
}

export function encryptPluginToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptPluginToken(value: string) {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Invalid encrypted plugin token.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function config(provider: PluginProvider, origin: string) {
  const configs = {
    github: { clientId: secret("GITHUB_CLIENT_ID"), clientSecret: secret("GITHUB_CLIENT_SECRET"), redirectUri: env("GITHUB_REDIRECT_URI") || `${origin}/api/plugins/github/callback` },
    notion: { clientId: secret("NOTION_CLIENT_ID"), clientSecret: secret("NOTION_CLIENT_SECRET"), redirectUri: env("NOTION_REDIRECT_URI") || `${origin}/api/plugins/notion/callback` },
    canva: { clientId: secret("CANVA_CLIENT_ID"), clientSecret: secret("CANVA_CLIENT_SECRET"), redirectUri: env("CANVA_REDIRECT_URI") || `${origin}/api/plugins/canva/callback` },
    discord: { clientId: secret("DISCORD_CLIENT_ID"), clientSecret: secret("DISCORD_CLIENT_SECRET"), redirectUri: env("DISCORD_REDIRECT_URI") || `${origin}/api/plugins/discord/callback` },
    vercel: { clientId: secret("VERCEL_CLIENT_ID") || secret("NEXT_PUBLIC_VERCEL_APP_CLIENT_ID"), clientSecret: secret("VERCEL_CLIENT_SECRET") || secret("VERCEL_APP_CLIENT_SECRET"), redirectUri: env("VERCEL_REDIRECT_URI") || `${origin}/api/plugins/vercel/callback` },
    "google-workspace": { clientId: secret("GOOGLE_OAUTH_CLIENT_ID"), clientSecret: secret("GOOGLE_OAUTH_CLIENT_SECRET"), redirectUri: env("GOOGLE_OAUTH_REDIRECT_URI") || `${origin}/api/plugins/google-workspace/callback` },
  } as const;
  return configs[provider];
}

export function authorizationUrl(provider: PluginProvider, state: string, origin: string, codeChallenge?: string) {
  const c = config(provider, origin);
  const urls: Record<PluginProvider, string> = {
    github: "https://github.com/login/oauth/authorize",
    notion: "https://api.notion.com/v1/oauth/authorize",
    canva: "https://www.canva.com/api/oauth/authorize",
    discord: "https://discord.com/oauth2/authorize",
    vercel: "https://vercel.com/oauth/authorize",
    "google-workspace": "https://accounts.google.com/o/oauth2/v2/auth",
  };
  const params = new URLSearchParams({ client_id: c.clientId, redirect_uri: c.redirectUri, response_type: "code", state });
  if (provider === "github") params.set("scope", "read:user user:email repo");
  if (provider === "notion") params.set("owner", "user");
  if (provider === "canva") {
    if (!codeChallenge) throw new Error("Canva PKCE challenge is required.");
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
    params.set("scope", "design:read design:write design:content:read design:content:write asset:read asset:write profile:read");
  }
  if (provider === "discord") params.set("scope", "identify email guilds");
  if (provider === "google-workspace") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    params.set("include_granted_scopes", "true");
    params.set("scope", ["openid", "email", "profile", "https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/calendar"].join(" "));
  }
  return `${urls[provider]}?${params}`;
}

async function tokenRequest(url: string, body: URLSearchParams, headers: HeadersInit = {}) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...headers }, body, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.error_description || data.error || "OAuth token request failed."));
  return data as Record<string, unknown>;
}

async function exchange(provider: PluginProvider, code: string, origin: string, codeVerifier?: string): Promise<TokenResult> {
  const c = config(provider, origin);
  if (provider === "github") {
    const data = await tokenRequest("https://github.com/login/oauth/access_token", new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, code, redirect_uri: c.redirectUri }));
    const accessToken = String(data.access_token || "");
    if (!accessToken) throw new Error("GitHub did not return an access token.");
    const profileResponse = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" }, cache: "no-store" });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) throw new Error("Unable to read the GitHub account.");
    const emailsResponse = await fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" }, cache: "no-store" });
    const emails = await emailsResponse.json().catch(() => []);
    const email = Array.isArray(emails) ? (emails.find((x) => x.primary && x.verified)?.email || emails.find((x) => x.verified)?.email || profile.email) : profile.email;
    return { accessToken, refreshToken: data.refresh_token ? String(data.refresh_token) : null, expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : null, accountId: String(profile.id), email: email ? String(email) : null, name: profile.name || profile.login || null, metadata: { login: profile.login } };
  }
  if (provider === "notion") {
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: c.redirectUri });
    const data = await tokenRequest("https://api.notion.com/v1/oauth/token", body, { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}` });
    const owner = (data.owner as Record<string, unknown> | undefined)?.user as Record<string, unknown> | undefined;
    const person = owner?.person as Record<string, unknown> | undefined;
    const accessToken = String(data.access_token || "");
    if (!accessToken) throw new Error("Notion did not return an access token.");
    return { accessToken, refreshToken: data.refresh_token ? String(data.refresh_token) : null, expiresAt: null, accountId: String(data.workspace_id || data.bot_id || "notion"), email: person?.email ? String(person.email) : null, name: owner?.name ? String(owner.name) : data.workspace_name ? String(data.workspace_name) : null, metadata: { workspaceId: data.workspace_id, workspaceName: data.workspace_name, botId: data.bot_id } };
  }
  if (provider === "canva") {
    if (!codeVerifier) throw new Error("Canva PKCE verifier is missing.");
    const data = await tokenRequest("https://api.canva.com/rest/v1/oauth/token", new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: c.redirectUri, code_verifier: codeVerifier }), { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}` });
    const accessToken = String(data.access_token || "");
    if (!accessToken) throw new Error("Canva did not return an access token.");
    const profileResponse = await fetch("https://api.canva.com/rest/v1/users/me", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const profile = await profileResponse.json().catch(() => ({}));
    return { accessToken, refreshToken: data.refresh_token ? String(data.refresh_token) : null, expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : null, accountId: String(profile.user_id || profile.id || "canva"), email: profile.email ? String(profile.email) : null, name: profile.display_name ? String(profile.display_name) : profile.name ? String(profile.name) : null };
  }
  if (provider === "discord") {
    const data = await tokenRequest("https://discord.com/api/v10/oauth2/token", new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "authorization_code", code, redirect_uri: c.redirectUri }));
    const accessToken = String(data.access_token || "");
    if (!accessToken) throw new Error("Discord did not return an access token.");
    const profileResponse = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) throw new Error("Unable to read the Discord account.");
    return { accessToken, refreshToken: data.refresh_token ? String(data.refresh_token) : null, expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : null, accountId: String(profile.id), email: profile.email ? String(profile.email) : null, name: profile.global_name || profile.username || null };
  }
  if (provider === "vercel") {
    const data = await tokenRequest("https://api.vercel.com/login/oauth/token", new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "authorization_code", code, redirect_uri: c.redirectUri }));
    const accessToken = String(data.access_token || "");
    if (!accessToken) throw new Error("Vercel did not return an access token.");
    const profileResponse = await fetch("https://api.vercel.com/login/oauth/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const profile = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok || !profile.sub) throw new Error("Unable to read the Vercel account.");
    return { accessToken, refreshToken: data.refresh_token ? String(data.refresh_token) : null, expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : Date.now() + 60 * 60 * 1000, accountId: String(profile.sub), email: profile.email ? String(profile.email) : null, name: profile.name || profile.preferred_username || null };
  }
  const data = await tokenRequest("https://oauth2.googleapis.com/token", new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, grant_type: "authorization_code" }));
  const accessToken = String(data.access_token || "");
  if (!accessToken) throw new Error("Google did not return an access token.");
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const profile = await profileResponse.json();
  if (!profileResponse.ok || !profile.sub) throw new Error("Unable to read the Google account.");
  return { accessToken, refreshToken: data.refresh_token ? String(data.refresh_token) : null, expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : null, accountId: String(profile.sub), email: profile.email ? String(profile.email) : null, name: profile.name || null, metadata: { scope: data.scope || null } };
}

function pkceVerifier() {
  return randomBytes(48).toString("base64url");
}
function pkceChallenge(verifier: string) {
  return createHashSha256(verifier);
}
function createHashSha256(value: string) {
  return createHmac("sha256", "sanmine-pkce").update(value).digest("base64url").replace(/=/g, "");
}

export async function createConnection(provider: PluginProvider, uid: string, code: string, origin: string, codeVerifier?: string) {
  await ensureTable();
  const token = await exchange(provider, code, origin, codeVerifier);
  const accessToken = encryptPluginToken(token.accessToken);
  const refreshToken = token.refreshToken ? encryptPluginToken(token.refreshToken) : null;
  const metadata = JSON.stringify(token.metadata || {});
  await sql`DELETE FROM plugin_connections WHERE user_id = ${uid} AND provider = ${provider}`;
  await sql`INSERT INTO plugin_connections (user_id, provider, provider_account_id, email, display_name, access_token, refresh_token, expires_at, metadata, created_at, updated_at) VALUES (${uid}, ${provider}, ${token.accountId}, ${token.email}, ${token.name}, ${accessToken}, ${refreshToken}, ${token.expiresAt}, ${metadata}::jsonb, NOW(), NOW())`;
}

export async function ensureTable() {
  await sql`CREATE TABLE IF NOT EXISTS plugin_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('github','notion','canva','discord','vercel','google-workspace')),
    provider_account_id TEXT NOT NULL,
    email TEXT,
    display_name TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS plugin_connections_user_idx ON plugin_connections(user_id, updated_at DESC)`;
}

export async function listConnections(uid: string) {
  await ensureTable();
  return sql`SELECT id, provider, provider_account_id, email, display_name, expires_at, metadata, created_at, updated_at FROM plugin_connections WHERE user_id = ${uid} ORDER BY updated_at DESC`;
}

async function refresh(provider: PluginProvider, row: Record<string, unknown>) {
  if (!row.refresh_token) throw new Error("No refresh token is available. Reconnect the provider account.");
  const c = config(provider, process.env.APP_URL?.trim() || "http://localhost:3000");
  const refreshToken = decryptPluginToken(String(row.refresh_token));
  let data: Record<string, unknown>;
  if (provider === "github") {
    data = await tokenRequest("https://github.com/login/oauth/access_token", new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }));
  } else if (provider === "notion") {
    data = await tokenRequest("https://api.notion.com/v1/oauth/token", new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }), { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}` });
  } else if (provider === "canva") {
    data = await tokenRequest("https://api.canva.com/rest/v1/oauth/token", new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }), { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}` });
  } else if (provider === "discord") {
    data = await tokenRequest("https://discord.com/api/v10/oauth2/token", new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }));
  } else if (provider === "vercel") {
    data = await tokenRequest("https://api.vercel.com/login/oauth/token", new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }));
  } else {
    data = await tokenRequest("https://oauth2.googleapis.com/token", new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }));
  }
  const accessToken = String(data.access_token || "");
  if (!accessToken) throw new Error("Provider refresh did not return an access token.");
  const newRefreshToken = data.refresh_token ? String(data.refresh_token) : refreshToken;
  const expiresAt = data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : row.expires_at ? Number(row.expires_at) : null;
  await sql`UPDATE plugin_connections SET access_token = ${encryptPluginToken(accessToken)}, refresh_token = ${encryptPluginToken(newRefreshToken)}, expires_at = ${expiresAt}, updated_at = NOW() WHERE id = ${String(row.id)}`;
  return accessToken;
}

export async function getAccessToken(uid: string, provider: PluginProvider) {
  await ensureTable();
  const rows = await sql`SELECT * FROM plugin_connections WHERE user_id = ${uid} AND provider = ${provider} LIMIT 1`;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("Provider account is not connected.");
  const expiresAt = row.expires_at ? Number(row.expires_at) : null;
  if (expiresAt && expiresAt < Date.now() + 60_000 && row.refresh_token) return refresh(provider, row);
  return decryptPluginToken(String(row.access_token));
}

export async function disconnectConnection(uid: string, id: string) {
  await ensureTable();
  const rows = await sql`SELECT * FROM plugin_connections WHERE id = ${id} AND user_id = ${uid} LIMIT 1`;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return false;
  const provider = String(row.provider) as PluginProvider;
  const accessToken = decryptPluginToken(String(row.access_token));
  const c = config(provider, process.env.APP_URL?.trim() || "http://localhost:3000");
  try {
    if (provider === "github") await fetch(`https://api.github.com/applications/${encodeURIComponent(c.clientId)}/grant`, { method: "DELETE", headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: JSON.stringify({ access_token: accessToken }) });
    if (provider === "notion") await fetch("https://api.notion.com/v1/oauth/revoke", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`, "Content-Type": "application/json", "Notion-Version": "2026-03-11" }, body: JSON.stringify({ token: accessToken }) });
    if (provider === "canva") await fetch("https://api.canva.com/rest/v1/oauth/revoke", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: accessToken }) });
    if (provider === "discord") await fetch("https://discord.com/api/v10/oauth2/token/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}` }, body: new URLSearchParams({ token: accessToken, token_type_hint: "access_token" }) });
    if (provider === "vercel") await fetch("https://api.vercel.com/login/oauth/token/revoke", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}` }, body: new URLSearchParams({ token: accessToken }) });
    if (provider === "google-workspace") await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  } finally {
    await sql`DELETE FROM plugin_connections WHERE id = ${id} AND user_id = ${uid}`;
  }
  return true;
}

export async function pkcePair() {
  const verifier = pkceVerifier();
  return { verifier, challenge: pkceChallenge(verifier) };
}
