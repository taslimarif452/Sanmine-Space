import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createConnection, isPluginProvider, verifyPluginState } from "@/lib/plugins/oauth";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await params;
  const url = new URL(request.url);
  const redirect = (status: "connected" | "error", message?: string) => {
    const target = new URL(`/plugins/${rawProvider}`, url.origin);
    target.searchParams.set(status, "1");
    if (message) target.searchParams.set("message", message.slice(0, 180));
    return NextResponse.redirect(target);
  };

  try {
    if (!isPluginProvider(rawProvider)) return redirect("error", "Unsupported plugin provider.");
    const error = url.searchParams.get("error");
    if (error) return redirect("error", url.searchParams.get("error_description") || error);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return redirect("error", "OAuth provider did not return a valid authorization response.");

    const stateData = verifyPluginState(state);
    if (stateData.provider !== rawProvider) return redirect("error", "OAuth provider state mismatch.");

    const cookieStore = await cookies();
    const storedState = cookieStore.get("sanmine_plugin_oauth_state")?.value;
    if (!storedState || storedState !== state) return redirect("error", "OAuth session expired. Please reconnect.");

    if (rawProvider === "canva") {
      const codeVerifier = cookieStore.get("sanmine_plugin_pkce")?.value;
      if (!codeVerifier) return redirect("error", "Canva authorization session expired. Please reconnect.");
      await createConnection(rawProvider, stateData.uid, code, url.origin, codeVerifier);
    } else {
      await createConnection(rawProvider, stateData.uid, code, url.origin);
    }

    const response = redirect("connected");
    response.cookies.delete("sanmine_plugin_oauth_state");
    response.cookies.delete("sanmine_plugin_pkce");
    return response;
  } catch (error) {
    console.error("Plugin OAuth callback failed", error);
    return redirect("error", error instanceof Error ? error.message : "Unable to complete provider authentication.");
  }
}
