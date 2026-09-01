import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRequestUser } from "@/lib/auth/request-user";
import { encryptToken, exchangeGoogleCode, verifyOAuthState } from "@/lib/email/oauth";
import { sql } from "@/lib/db/neon";

async function ensureTable() {
  await sql`CREATE TABLE IF NOT EXISTS email_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google','microsoft')),
    provider_account_id TEXT,
    email TEXT NOT NULL,
    display_name TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider, email)
  )`;
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const redirect = (result: string) => NextResponse.redirect(`${origin}/?email_oauth=${encodeURIComponent(result)}`);
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return redirect("google_error");
    const cookieStore = await cookies();
    const savedState = cookieStore.get("sanmine_google_oauth_state")?.value;
    if (!savedState || savedState !== state) throw new Error("OAuth state mismatch.");
    const stateData = verifyOAuthState(state);
    const token = await exchangeGoogleCode(code, origin);
    await ensureTable();
    await sql`INSERT INTO email_connections (user_id, provider, email, display_name, access_token, refresh_token, expires_at, updated_at)
      VALUES (${stateData.uid}, 'google', ${token.email}, ${token.name}, ${encryptToken(token.accessToken)}, ${token.refreshToken ? encryptToken(token.refreshToken) : null}, ${token.expiresAt}, NOW())
      ON CONFLICT (user_id, provider, email) DO UPDATE SET display_name=EXCLUDED.display_name, access_token=EXCLUDED.access_token, refresh_token=COALESCE(EXCLUDED.refresh_token, email_connections.refresh_token), expires_at=EXCLUDED.expires_at, updated_at=NOW()`;
    const response = redirect("google_connected");
    response.cookies.delete("sanmine_google_oauth_state");
    return response;
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    const response = redirect("google_error");
    response.cookies.delete("sanmine_google_oauth_state");
    return response;
  }
}
