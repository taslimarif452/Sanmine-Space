import type { AgentTool } from "@/lib/agent/tools/types";

export const youtubeSearchTool: AgentTool = {
  name: "youtube_search",
  description: "Search YouTube directly with YouTube Data API v3. For creator/channel/YouTuber requests, search channels and return channel name, URL, description, published date, subscriber count, video count and view count. For video requests, search videos. Never substitute another website for YouTube data.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "YouTube search query or creator niche." },
      limit: { type: "number", description: "Number of results, from 1 to 10." },
      region_code: { type: "string", description: "Optional two-letter country code such as IN or US." },
      type: { type: "string", enum: ["creator", "channel", "video"], description: "Return creators/channels or videos. Use creator/channel for creator-finding requests." },
    },
    required: ["query"],
  },
  execute: async (args) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return { status: "not_configured", message: "YOUTUBE_API_KEY is not configured." };
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return { status: "error", message: "A search query is required." };
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 10);
    const region = typeof args.region_code === "string" ? args.region_code.trim().toUpperCase() : "";
    const mode = args.type === "video" ? "video" : "channel";
    const params = new URLSearchParams({ part: "snippet", q: query, type: mode, maxResults: String(limit), key: apiKey });
    if (/^[A-Z]{2}$/.test(region)) params.set("regionCode", region);
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `YouTube search failed (${response.status}).`);
    const items = data.items ?? [];
    if (mode === "video") return { status: "success", source: "YouTube Data API v3", query, type: "video", results: items.map((item: any) => ({ video_id: item.id?.videoId, title: item.snippet?.title, description: item.snippet?.description, channel_id: item.snippet?.channelId, channel_title: item.snippet?.channelTitle, published_at: item.snippet?.publishedAt, url: item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : undefined, channel_url: item.snippet?.channelId ? `https://www.youtube.com/channel/${item.snippet.channelId}` : undefined })) };
    const channelIds = items.map((item: any) => item.id?.channelId).filter(Boolean).join(",");
    if (!channelIds) return { status: "success", source: "YouTube Data API v3", query, type: "creator", results: [] };
    const statsParams = new URLSearchParams({ part: "snippet,statistics,brandingSettings", id: channelIds, key: apiKey });
    const statsResponse = await fetch(`https://www.googleapis.com/youtube/v3/channels?${statsParams.toString()}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    const statsData = await statsResponse.json();
    if (!statsResponse.ok) throw new Error(statsData?.error?.message || `YouTube channel lookup failed (${statsResponse.status}).`);
    return { status: "success", source: "YouTube Data API v3", query, type: "creator", results: (statsData.items ?? []).map((channel: any) => ({ channel_id: channel.id, creator_name: channel.snippet?.title, description: channel.snippet?.description, published_at: channel.snippet?.publishedAt, country: channel.snippet?.country, custom_url: channel.snippet?.customUrl, subscribers: channel.statistics?.subscriberCount, videos: channel.statistics?.videoCount, total_views: channel.statistics?.viewCount, url: `https://www.youtube.com/channel/${channel.id}`, thumbnail: channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.default?.url })) };
  },
};
