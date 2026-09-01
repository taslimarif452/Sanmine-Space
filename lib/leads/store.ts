import type { Lead, LeadStatus } from "@/lib/leads/types";
import { scoreLead, type LeadInput } from "@/lib/leads/scoring";

const globalStore = globalThis as typeof globalThis & { __sanmineLeads?: Map<string, Lead> };
const leads = globalStore.__sanmineLeads ?? new Map<string, Lead>();
globalStore.__sanmineLeads = leads;

export function createLead(input: LeadInput): Lead {
  const now = new Date().toISOString();
  const scored = scoreLead(input);
  const lead: Lead = {
    ...input,
    id: crypto.randomUUID(),
    score: scored.score,
    scoreReasons: scored.reasons,
    status: "new",
    createdAt: now,
    updatedAt: now,
  };
  leads.set(lead.id, lead);
  return lead;
}

export function listLeads(options?: { status?: LeadStatus; minScore?: number; limit?: number }) {
  return [...leads.values()]
    .filter((lead) => !options?.status || lead.status === options.status)
    .filter((lead) => lead.score >= (options?.minScore ?? 0))
    .sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.min(options?.limit ?? 100, 100));
}

export function getLead(id: string) { return leads.get(id); }

export function updateLead(id: string, patch: Partial<Pick<Lead, "status" | "businessName" | "website" | "email" | "phone" | "location" | "description">>) {
  const existing = leads.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  leads.set(id, updated);
  return updated;
}
