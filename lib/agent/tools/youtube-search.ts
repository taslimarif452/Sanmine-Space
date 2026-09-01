import type { AgentTool } from "@/lib/agent/tools/types";

export const youtubeSearchTool: AgentTool = {
  name: "youtube_search",
  description:
    "Search YouTube for public videos/channels relevant to a business niche or lead-finding request. Requires a YouTube Data API v3 key.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to search for on YouTube." },
      limit: { type: "number", description: "Number of results, from 1 to 10." },
      region_code: { type: "string", description: "Optional two-letter country code such as IN or US." },
    },
    required: ["query"],
  },
  execute: async (args) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return { status: "not_configured", message: "YOUTUBE_API_KEY is not configured." };
    }

    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return { status: "error", message: "A search query is required." };

    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 10);
    const region = typeof args.region_code === "string" ? args.region_code.trim().toUpperCase() : "";
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "video",
      maxResults: String(limit),
      key: apiKey,
    });
    if (/^[A-Z]{2}$/.test(region)) params.set("regionCode", region);

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `YouTube search failed (${response.status}).`);

    return {
      status: "success",
      query,
      results: (data.items ?? []).map((item: any) => ({
        video_id: item.id?.videoId,
        title: item.snippet?.title,
        description: item.snippet?.description,
        channel_id: item.snippet?.channelId,
        channel_title: item.snippet?.channelTitle,
        published_at: item.snippet?.publishedAt,
        url: item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : undefined,
        channel_url: item.snippet?.channelId ? `https://www.youtube.com/channel/${item.snippet.channelId}` : undefined,
      })),
    };
  },
};
