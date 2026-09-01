import { youtubeSearchTool } from "@/lib/agent/tools/youtube-search";
import type { AgentTool, ToolDefinition } from "@/lib/agent/tools/types";

export const youtubeTools: AgentTool[] = [youtubeSearchTool];
export const youtubeToolDefinitions: ToolDefinition[] = youtubeTools.map(({ execute: _execute, ...definition }) => definition);
