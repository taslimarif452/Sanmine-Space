import type { Lead } from "@/lib/leads/types";

export type LeadInput = Omit<Lead, "id" | "score" | "scoreReasons" | "createdAt" | "updatedAt" | "status"> & { signals?: string[] };

export function scoreLead(input: LeadInput) {
  let score = 0;
  const reasons: string[] = [];
  const text = `${input.businessName} ${input.description ?? ""} ${(input.signals ?? []).join(" ")}`.toLowerCase();

  if (input.website) { score += 20; reasons.push("Has a public website"); }
  else { score += 8; reasons.push("No website found — potential website opportunity"); }
  if (input.email) { score += 20; reasons.push("Public email found"); }
  if (input.phone) { score += 10; reasons.push("Public phone found"); }
  if (input.location) { score += 10; reasons.push("Business location identified"); }
  if (input.source === "youtube") { score += 8; reasons.push("Discovered through YouTube"); }
  if (/contact|quote|book|appointment|services|pricing/.test(text)) { score += 12; reasons.push("Commercial intent signals found"); }
  if (/small|local|independent|startup|agency|studio|shop|restaurant|clinic/.test(text)) { score += 10; reasons.push("Matches small/local business signals"); }

  return { score: Math.min(score, 100), reasons };
}
