import type { AgentTool,ToolDefinition } from "@/lib/agent/tools/types";
import { searchWebTool } from "@/lib/agent/tools/search-web";
import { openPageTool } from "@/lib/agent/tools/open-page";
import { websiteAnalyzeTool } from "@/lib/agent/tools/website-analyze";
import { generateProposalTool } from "@/lib/agent/tools/generate-proposal";
import { generateEmailTool } from "@/lib/agent/tools/generate-email";
import { sendProposalOutreachTool } from "@/lib/agent/tools/send-proposal-outreach";
import { youtubeSearchTool } from "@/lib/agent/tools/youtube-search";
import { researchLeadsTool } from "@/lib/agent/tools/research-leads";
const tools:AgentTool[]=[searchWebTool,openPageTool,websiteAnalyzeTool,youtubeSearchTool,researchLeadsTool,generateProposalTool,generateEmailTool,sendProposalOutreachTool,{name:"agent_capabilities",description:"Return the capabilities currently enabled in Sanmine Space.",parameters:{type:"object",properties:{}},execute:async()=>({agent:"Sanmine Space",enabled:["chat","tool_calling","web_research","youtube_data_api_v3","structured_research_storage","website_verification","contact_confidence_scoring","lead_deduplication","lead_scoring","research_history","website_audit","ai_demo_brief","audit_aware_personalized_proposal","multi_source_creator_intelligence","smart_lead_ranking","ai_followups","approval_center","bulk_approval","campaign_sequences","suppression_list","gmail_reply_detection","gmail_bounce_detection","campaign_analytics","crm_pipeline","gmail_proposal_sending","background_campaigns"]})}];
export function getTools():AgentTool[]{return tools;}export function getToolDefinitions():ToolDefinition[]{return tools.map(({execute:_execute,...definition})=>definition);}export function getTool(name:string):AgentTool|undefined{return tools.find(tool=>tool.name===name);}
