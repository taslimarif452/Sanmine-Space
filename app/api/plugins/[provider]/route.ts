import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { authorizationUrl, createPluginState, isPluginProvider, pkcePair } from "@/lib/plugins/oauth";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const user = await getRequestUser(request);
    const { provider: rawProvider } = await params;
    if (!isPluginProvider(rawProvider)) return NextResponse.json({ error: "Unsupported plugin provider." }, { status: 404 });
    const origin = new URL(request.url).origin;
    const requestUrl = new URL(request.url);
    const managePlugin = requestUrl.searchParams.get("plugin")?.trim() || rawProvider;
    const state = createPluginState(user.uid, rawProvider);
    let url: string;
    const responseData = { url: "" };
    if (rawProvider === "canva") {
      const pair = await pkcePair();
      url = authorizationUrl(rawProvider, state, origin, pair.challenge);
      const response = NextResponse.json({ url });
      response.cookies.set("sanmine_plugin_pkce", pair.verifier, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/plugins/canva/callback" });
      response.cookies.set("sanmine_plugin_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/plugins" });
      response.cookies.set("sanmine_plugin_manage_id", managePlugin, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/plugins" });
      return response;
    }
    url = authorizationUrl(rawProvider, state, origin);
    responseData.url = url;
    const response = NextResponse.json(responseData);
    response.cookies.set("sanmine_plugin_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/plugins" });
    response.cookies.set("sanmine_plugin_manage_id", managePlugin, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/plugins" });
    return response;
  } catch (error) {
    console.error("Plugin OAuth start failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start plugin authentication." }, { status: 500 });
  }
}