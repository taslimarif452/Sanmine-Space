import { getProvider, type ChatMessage } from "@/lib/ai/provider";
import type { AgentTool } from "@/lib/agent/tools/types";

function text(args: Record<string, unknown>, key: string, fallback = "") {
  const value = args[key];
  return typeof value === "string" ? value.trim() : fallback;
}

export const generateProposalTool: AgentTool = {
  name: "generate_proposal",
  description: "Generate a polished client proposal from a lead/client brief, services, scope, deliverables, timeline, pricing, and research context. Use this when the user asks for a proposal, pitch, statement of work, or client offer.",
  parameters: {
    type: "object",
    properties: {
      client_name: { type: "string", description: "Client contact or company name." },
      company: { type: "string", description: "Client company name, if known." },
      objective: { type: "string", description: "The client's goal or business problem." },
      services: { type: "string", description: "Services being proposed." },
      scope: { type: "string", description: "Specific scope of work." },
      deliverables: { type: "string", description: "Expected deliverables." },
      timeline: { type: "string", description: "Timeline or milestones, if known." },
      pricing: { type: "string", description: "Pricing or budget, if known. Never invent it; use TBD if absent." },
      research: { type: "string", description: "Relevant research, lead details, or website findings." },
      tone: { type: "string", description: "Tone such as professional, concise, premium, or friendly." },
      brief: { type: "string", description: "Any additional instructions or context." }
    },
    required: ["services"]
  },
  execute: async (args) => {
    const client = text(args, "client_name", "Client");
    const company = text(args, "company");
    const objective = text(args, "objective");
    const services = text(args, "services");
    const scope = text(args, "scope", "Define the scope clearly from the provided brief; do not invent unsupported commitments.");
    const deliverables = text(args, "deliverables", "To be finalized with the client.");
    const timeline = text(args, "timeline", "To be agreed with the client.");
    const pricing = text(args, "pricing", "TBD — confirm before sending.");
    const research = text(args, "research");
    const tone = text(args, "tone", "professional, clear, confident");
    const brief = text(args, "brief");

    const prompt = `Create a client-ready business proposal. Return ONLY the proposal body in clean Markdown, with headings and bullets where useful. Do not add commentary about being an AI. Do not invent facts, metrics, case studies, guarantees, pricing, dates, or capabilities. If information is missing, use a natural placeholder such as [TBD] rather than making it up.

Client: ${client}
Company: ${company || "[Company]"}
Objective/problem: ${objective || "[Client objective]"}
Services: ${services}
Scope: ${scope}
Deliverables: ${deliverables}
Timeline: ${timeline}
Pricing: ${pricing}
Research/context: ${research || "None provided"}
Additional brief: ${brief || "None"}
Tone: ${tone}

Structure it as: title, executive summary, understanding of the need, proposed solution, scope and deliverables, timeline, investment, next steps, and a concise closing. Keep it persuasive but factual.`;

    const messages: ChatMessage[] = [
      { role: "system", content: "You are a senior B2B proposal writer for Sanmine Space. Produce specific, credible, client-ready copy. Never fabricate evidence or commercial terms." },
      { role: "user", content: prompt }
    ];
    const result = await getProvider().chat(messages);
    if (!result.text) throw new Error("Proposal generator returned an empty response.");
    return { status: "generated", type: "proposal", content: result.text };
  }
};
