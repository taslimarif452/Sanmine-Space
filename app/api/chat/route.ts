import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/agent";
import type { ChatMessage } from "@/lib/ai/provider";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? (body.history as ChatMessage[]) : [];

    if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });

    const result = await runAgent(history, message);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Chat API error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 },
    );
  }
}
