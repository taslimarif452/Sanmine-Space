import { NextRequest, NextResponse } from "next/server";
import { createLead, listLeads } from "@/lib/leads/store";
import type { LeadInput } from "@/lib/leads/scoring";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as LeadInput["source"] | null;
  const minScore = Number(searchParams.get("minScore") ?? 0);
  const limit = Number(searchParams.get("limit") ?? 100);
  return NextResponse.json({ leads: listLeads({ status: status as never, minScore, limit }) });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<LeadInput>;
    if (!body.businessName || !body.source) return NextResponse.json({ error: "businessName and source are required" }, { status: 400 });
    const lead = createLead({
      businessName: body.businessName,
      website: body.website,
      email: body.email,
      phone: body.phone,
      location: body.location,
      description: body.description,
      source: body.source,
      sourceUrl: body.sourceUrl,
      signals: body.signals,
    });
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create lead" }, { status: 500 });
  }
}
