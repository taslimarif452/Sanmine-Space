import type { AgentTool, ToolDefinition } from "@/lib/agent/tools/types";
import { searchWebTool } from "@/lib/agent/tools/search-web";
import { openPageTool } from "@/lib/agent/tools/open-page";
import { websiteAnalyzeTool } from "@/lib/agent/tools/website-analyze";
import { generateProposalTool } from "@/lib/agent/tools/generate-proposal";
import { generateEmailTool } from "@/lib/agent/tools/generate-email";
import { sendProposalOutreachTool } from "@/lib/agent/tools/send-proposal-outreach";
import { youtubeSearchTool } from "@/lib/agent/tools/youtube-search";

const tools: AgentTool[] = [
  searchWebTool,
  openPageTool,
  websiteAnalyzeTool,
  youtubeSearchTool,
  generateProposalTool,
  generateEmailTool,
  sendProposalOutreachTool,
  {
    name: "agent_capabilities",
    description: "Return the capabilities currently enabled in Sanmine Space.",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ agent: "Sanmine Space", enabled: ["chat", "tool_calling", "web_research", "youtube_data_api_v3", "open_page", "website_analyze", "proposal_generator", "email_generator", "contact_research", "gmail_proposal_sending", "approval_to_send", "background_campaigns"], coming_next: [] }),
  },
];

export function getTools(): AgentTool[] { return tools; }
export function getToolDefinitions(): ToolDefinition[] { return tools.map(({ execute: _execute, ...definition }) => definition); }
export function getTool(name: string): AgentTool | undefined { return tools.find((tool) => tool.name === name); }
