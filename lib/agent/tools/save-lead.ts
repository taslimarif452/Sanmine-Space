import type { AgentTool } from "@/lib/agent/tools/types";
import { createLead } from "@/lib/leads/store";

export const saveLeadTool: AgentTool = {
  name: "save_lead",
  description: "Save a researched business as a lead and automatically calculate its outreach opportunity score from available public signals.",
  parameters: {
    type: "object",
    properties: {
      businessName: { type: "string" },
      website: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      location: { type: "string" },
      description: { type: "string" },
      source: { type: "string", enum: ["web", "youtube", "manual"] },
      sourceUrl: { type: "string" },
      signals: { type: "array", items: { type: "string" } },
    },
    required: ["businessName", "source"],
  },
  execute: async (args) => {
    const lead = createLead({
      businessName: String(args.businessName),
      website: args.website ? String(args.website) : undefined,
      email: args.email ? String(args.email) : undefined,
      phone: args.phone ? String(args.phone) : undefined,
      location: args.location ? String(args.location) : undefined,
      description: args.description ? String(args.description) : undefined,
      source: args.source as "web" | "youtube" | "manual",
      sourceUrl: args.sourceUrl ? String(args.sourceUrl) : undefined,
      signals: Array.isArray(args.signals) ? args.signals.map(String) : [],
    });
    return { status: "success", lead };
  },
};
