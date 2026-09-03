import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { savePreferences } from "@/lib/agent/phase4";
import { sql, hasDatabaseConfig } from "@/lib/db/neon";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!hasDatabaseConfig()) return NextResponse.json({ settings: {} });
    const rows = await sql`SELECT settings FROM user_preferences WHERE user_id=${user.uid} LIMIT 1`;
    return NextResponse.json({ settings: rows[0]?.settings || {} });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load preferences." }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getRequestUser(request);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Preferences must be an object." }, { status: 400 });
    const allowed = ["locale", "timezone", "responseStyle", "preferredModel", "theme", "compactMode"];
    const settings = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    return NextResponse.json({ settings: (await savePreferences(user.uid, settings))?.settings || settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save preferences." }, { status: 400 });
  }
}
