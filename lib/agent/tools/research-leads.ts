import type { AgentTool } from "@/lib/agent/tools/types";
import { saveResearch } from "@/lib/research/storage";

export const researchLeadsTool: AgentTool = {
  name: "research_leads",
  description: "Persist structured research leads with real website verification, contact-confidence scoring, deterministic lead scoring, and per-user deduplication. Use after web/YouTube research when a lead list should be saved for later history and campaigns.",
  parameters: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Authenticated user id supplied by the runtime." },
      query: { type: "string", description: "Research query that produced these leads." },
      source: { type: "string", description: "Research source, e.g. YouTube Data API v3 or web." },
      leads: { type: "array", description: "Structured lead records.", items: { type: "object" } },
      metadata: { type: "object", description: "Optional research metadata." },
    },
    required: ["user_id", "query", "source", "leads"],
  },
  execute: async (args) => {
    const userId = typeof args.user_id === "string" ? args.user_id.trim() : "";
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const source = typeof args.source === "string" ? args.source.trim() : "";
    if (!userId || !query || !source || !Array.isArray(args.leads)) return { status: "error", message: "user_id, query, source, and leads are required." };
    const leads = args.leads.filter((lead): lead is Record<string, unknown> => Boolean(lead && typeof lead === "object" && typeof (lead as any).name === "string")).slice(0, 50).map((lead) => ({
      name: String(lead.name), email: typeof lead.email === "string" ? lead.email : null, website_url: typeof lead.website_url === "string" ? lead.website_url : null,
      country: typeof lead.country === "string" ? lead.country : null, niche: typeof lead.niche === "string" ? lead.niche : null,
      youtube_channel_id: typeof lead.youtube_channel_id === "string" ? lead.youtube_channel_id : null, youtube_url: typeof lead.youtube_url === "string" ? lead.youtube_url : null,
      subscribers: lead.subscribers as any, total_views: lead.total_views as any, description: typeof lead.description === "string" ? lead.description : null,
      evidence: lead.evidence && typeof lead.evidence === "object" ? lead.evidence as Record<string, unknown> : {}, sources: Array.isArray(lead.sources) ? lead.sources as any : [],
    }));
    const result = await saveResearch(userId, query, source, leads, args.metadata && typeof args.metadata === "object" ? args.metadata as Record<string, unknown> : {});
    return { status: "success", ...result };
  },
};
