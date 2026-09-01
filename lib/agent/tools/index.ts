import type { AgentTool, ToolDefinition } from "@/lib/agent/tools/types";

const tools: AgentTool[] = [
  {
    name: "search_web",
    description:
      "Search the public web for businesses, people, websites, or factual information. Use this when the user explicitly asks you to find or research something online.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The web search query." },
        limit: { type: "number", description: "Maximum number of results requested, from 1 to 10." },
      },
      required: ["query"],
    },
    execute: async ({ query, limit = 5 }) => ({
      status: "not_configured",
      query,
      limit,
      message:
        "Web search is registered but its external search provider will be connected in Phase 3. Do not present these fields as search results.",
    }),
  },
  {
    name: "agent_capabilities",
    description: "Return the capabilities currently enabled in Sanmine Space.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async () => ({
      agent: "Sanmine Space",
      enabled: ["chat", "tool_calling"],
      coming_next: ["web_research", "youtube_leads", "lead_scoring", "email_outreach"],
    }),
  },
];

export function getTools(): AgentTool[] {
  return tools;
}

export function getToolDefinitions(): ToolDefinition[] {
  return tools.map(({ execute: _execute, ...definition }) => definition);
}

export function getTool(name: string): AgentTool | undefined {
  return tools.find((tool) => tool.name === name);
}
