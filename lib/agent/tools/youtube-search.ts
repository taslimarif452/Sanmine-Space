import type { AgentTool } from "@/lib/agent/tools/types";

type YouTubeItem = {
  id?: { channelId?: string; videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url?: string }; default?: { url?: string } };
    country?: string;
  };
};

const WEBSITE_URL_RE = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/gi;
const SOCIAL_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "facebook.com",
  "fb.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "t.me",
  "telegram.me",
  "discord.com",
  "discord.gg",
  "tiktok.com",
]);

function cleanUrl(value: string) {
  return value.replace(/[.,!?;:]+$/, "");
}

function hasExternalWebsite(description = "") {
  const urls = description.match(WEBSITE_URL_RE)?.map(cleanUrl) ?? [];
  for (const raw of urls) {
    try {
      const normalized = raw.startsWith("www.") ? `https://${raw}` : raw;
      const host = new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
      if (!SOCIAL_HOSTS.has(host)) return true;
    } catch {
      // Ignore malformed text that only looks like a URL.
    }
  }
  return false;
}

function wantsNoWebsite(query: string) {
  return /no\s+(a\s+)?website|without\s+(a\s+)?website|website\s*(nahi|nahin|nhi|nh)|website\s*(is\s*)?not/i.test(query);
}

function wantsIndia(query: string) {
  return /\bindia\b|\bindian\b|bharat|bhartiya/i.test(query);
}

function candidateQuery(query: string) {
  if (wantsIndia(query)) return "Indian YouTuber creator";
  return "YouTube creator";
}

export const youtubeSearchTool: AgentTool = {
  name: "youtube_search",
  description:
    "Search YouTube directly with the official YouTube Data API v3. For creator/channel requests, search channels and return channel metadata and statistics. For requests asking for creators without a website, first discover a larger candidate set on YouTube, then use only public channel descriptions to exclude channels that advertise an external website. Never substitute another website for YouTube creator data.",
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
    if (!apiKey) {
      return { status: "not_configured", source: "YouTube Data API v3", message: "YOUTUBE_API_KEY is not configured in the server environment." };
    }

    const rawQuery = typeof args.query === "string" ? args.query.trim() : "";
    if (!rawQuery) return { status: "error", source: "YouTube Data API v3", message: "A search query is required." };

    const requestedLimit = Math.min(Math.max(Number(args.limit) || 10, 1), 10);
    const filterNoWebsite = wantsNoWebsite(rawQuery);
    const query = filterNoWebsite ? candidateQuery(rawQuery) : rawQuery;
    const region = typeof args.region_code === "string" && /^[A-Za-z]{2}$/.test(args.region_code.trim())
      ? args.region_code.trim().toUpperCase()
      : wantsIndia(rawQuery) ? "IN" : "";
    const mode = args.type === "video" ? "video" : "channel";
    const searchLimit = filterNoWebsite ? 50 : requestedLimit;

    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: mode,
      maxResults: String(searchLimit),
      key: apiKey,
    });
    if (region) params.set("regionCode", region);

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = data?.error?.errors?.[0]?.reason;
      throw new Error(`${data?.error?.message || `YouTube search failed (${response.status}).`}${reason ? ` [${reason}]` : ""}`);
    }

    const items: YouTubeItem[] = Array.isArray(data.items) ? data.items : [];
    if (mode === "video") {
      return {
        status: "success",
        source: "YouTube Data API v3",
        query,
        requested_query: rawQuery,
        type: "video",
        results: items.map((item) => ({
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
    }

    const channelIds = [...new Set(items.map((item) => item.id?.channelId).filter(Boolean))].join(",");
    if (!channelIds) {
      return {
        status: "success",
        source: "YouTube Data API v3",
        query,
        requested_query: rawQuery,
        type: "creator",
        results: [],
        candidate_count: 0,
        message: "YouTube Data API v3 returned no matching channels for the normalized search query. This is not an API-key error.",
      };
    }

    const statsParams = new URLSearchParams({ part: "snippet,statistics,brandingSettings", id: channelIds, key: apiKey });
    const statsResponse = await fetch(`https://www.googleapis.com/youtube/v3/channels?${statsParams.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const statsData = await statsResponse.json().catch(() => ({}));
    if (!statsResponse.ok) {
      const reason = statsData?.error?.errors?.[0]?.reason;
      throw new Error(`${statsData?.error?.message || `YouTube channel lookup failed (${statsResponse.status}).`}${reason ? ` [${reason}]` : ""}`);
    }

    const channels = (Array.isArray(statsData.items) ? statsData.items : []).map((channel: any) => {
      const description = String(channel.snippet?.description || "");
      const externalWebsite = hasExternalWebsite(description);
      return {
        channel_id: channel.id,
        creator_name: channel.snippet?.title,
        description,
        published_at: channel.snippet?.publishedAt,
        country: channel.snippet?.country,
        custom_url: channel.snippet?.customUrl,
        subscribers: channel.statistics?.subscriberCount,
        videos: channel.statistics?.videoCount,
        total_views: channel.statistics?.viewCount,
        url: `https://www.youtube.com/channel/${channel.id}`,
        thumbnail: channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.default?.url,
        website_in_channel_description: externalWebsite,
      };
    });

    const filtered = filterNoWebsite
      ? channels.filter((channel) => !channel.website_in_channel_description).slice(0, requestedLimit)
      : channels.slice(0, requestedLimit);

    return {
      status: "success",
      source: "YouTube Data API v3",
      query,
      requested_query: rawQuery,
      type: "creator",
      region_code: region || undefined,
      candidate_count: channels.length,
      results: filtered,
      website_filter: filterNoWebsite
        ? "Excluded channels whose public YouTube channel description contains an external website URL. Social-only links were not treated as a website."
        : undefined,
      note: filterNoWebsite && filtered.length < requestedLimit
        ? `Only ${filtered.length} matching channels were found in the YouTube candidate set. The API does not expose a definitive has-website field, so website absence is inferred from the public channel description.`
        : filterNoWebsite
          ? "Website absence is inferred from the public YouTube channel description; YouTube Data API v3 does not expose a definitive has-website field."
          : undefined,
    };
  },
};
