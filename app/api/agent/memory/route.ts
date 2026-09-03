import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { recall, remember } from "@/lib/agent/phase4";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    const memories = await recall(user.uid);
    return NextResponse.json({ memories });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load memory." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    const body = await request.json();
    if (typeof body?.key !== "string" || typeof body?.value !== "string" || !body.key.trim() || !body.value.trim()) return NextResponse.json({ error: "key and value are required." }, { status: 400 });
    const memory = await remember(user.uid, body.type || "fact", body.key.trim(), body.value.trim(), Number.isFinite(body.confidence) ? Number(body.confidence) : 1);
    return NextResponse.json({ memory });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save memory." }, { status: 400 });
  }
}
