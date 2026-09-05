import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { authorizationUrl, createPluginState, isPluginProvider, pkcePair } from "@/lib/plugins/oauth";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const user = await getRequestUser(request);
    const { provider: rawProvider } = await params;
    if (!isPluginProvider(rawProvider)) return NextResponse.json({ error: "Unsupported plugin provider." }, { status: 404 });
    const origin = new URL(request.url).origin;
    const state = createPluginState(user.uid, rawProvider);
    let url: string;
    const response = NextResponse.json({ url: "" });
    if (rawProvider === "canva") {
      const pair = await pkcePair();
      url = authorizationUrl(rawProvider, state, origin, pair.challenge);
      response.cookies.set("sanmine_plugin_pkce", pair.verifier, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/plugins/canva/callback" });
    } else {
      url = authorizationUrl(rawProvider, state, origin);
    }
    response.cookies.set("sanmine_plugin_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/plugins" });
    return NextResponse.json({ url }, { headers: response.headers });
  } catch (error) {
    console.error("Plugin OAuth start failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start plugin authentication." }, { status: 500 });
  }
}
