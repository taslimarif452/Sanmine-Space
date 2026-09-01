import type { AgentTool, ToolDefinition } from "@/lib/agent/tools/types";
import { searchWebTool } from "@/lib/agent/tools/search-web";

const tools: AgentTool[] = [
  searchWebTool,
  {
    name: "agent_capabilities",
    description: "Return the capabilities currently enabled in Sanmine Space.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async () => ({
      agent: "Sanmine Space",
      enabled: ["chat", "tool_calling", "web_research"],
      coming_next: ["youtube_leads", "lead_scoring", "email_outreach"],
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
