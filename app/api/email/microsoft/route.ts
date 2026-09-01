import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { createOAuthState, microsoftAuthorizationUrl } from "@/lib/email/oauth";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    const origin = new URL(request.url).origin;
    const state = createOAuthState(user.uid);
    const response = NextResponse.json({ url: microsoftAuthorizationUrl(state, origin) });
    response.cookies.set("sanmine_microsoft_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
    return response;
  } catch (error) {
    console.error("Microsoft OAuth start failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Microsoft OAuth." }, { status: 500 });
  }
}
