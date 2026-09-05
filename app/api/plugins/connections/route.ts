import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { disconnectConnection, isPluginProvider, listConnections } from "@/lib/plugins/oauth";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    const connections = await listConnections(user.uid);
    return NextResponse.json({ connections });
  } catch (error) {
    console.error("Plugin connections GET failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load plugin connections." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getRequestUser(request);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    const provider = body.provider ? String(body.provider) : "";
    if (!id) return NextResponse.json({ error: "Connection id is required." }, { status: 400 });
    if (provider && !isPluginProvider(provider)) return NextResponse.json({ error: "Unsupported plugin provider." }, { status: 400 });
    const deleted = await disconnectConnection(user.uid, id);
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    console.error("Plugin connection DELETE failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to disconnect plugin." }, { status: 500 });
  }
}
