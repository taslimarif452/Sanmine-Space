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

type YouTubeChannel = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    country?: string;
    customUrl?: string;
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
    viewCount?: string;
  };
};

type SearchResponse = {
  items?: YouTubeItem[];
  nextPageToken?: string;
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

function candidateQueries(query: string) {
  if (wantsIndia(query)) {
    // Keep the YouTube search broad. "Indian YouTuber creator" was too
    // restrictive and can legitimately return zero channels even with a valid
    // API key. The India signal is supplied separately via regionCode.
    return ["Indian creator", "Indian YouTuber", "India creator"];
  }
  return ["YouTube creator"];
}

async function youtubeJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason;
    throw new Error(`${data?.error?.message || `YouTube API request failed (${response.status}).`}${reason ? ` [${reason}]` : ""}`);
  }
  return data;
}

async function searchChannels(apiKey: string, query: string, region: string, pageToken?: string): Promise<SearchResponse> {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "channel",
    maxResults: "50",
    key: apiKey,
  });
  if (region) params.set("regionCode", region);
  if (pageToken) params.set("pageToken", pageToken);
  return youtubeJson(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`) as Promise<SearchResponse>;
}

async function loadChannels(apiKey: string, channelIds: string[]) {
  if (!channelIds.length) return [] as YouTubeChannel[];
  const params = new URLSearchParams({
    part: "snippet,statistics",
    id: channelIds.join(","),
    key: apiKey,
  });
  const data = await youtubeJson(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`);
  return (Array.isArray(data.items) ? data.items : []) as YouTubeChannel[];
}

function normalizeChannels(channels: YouTubeChannel[]) {
  return channels.map((channel) => {
    const description = String(channel.snippet?.description || "");
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
      url: channel.id ? `https://www.youtube.com/channel/${channel.id}` : undefined,
      website_in_channel_description: hasExternalWebsite(description),
    };
  });
}

export const youtubeSearchTool: AgentTool = {
  name: "youtube_search",
  description:
    "Search YouTube directly with the official YouTube Data API v3. For creator/channel requests, search channels and return channel metadata and statistics. For requests asking for creators without a website, discover a broad candidate set on YouTube, then use only public YouTube channel descriptions to exclude channels that advertise an external website. Never substitute another website for YouTube creator data.",
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
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) {
      return {
        status: "not_configured",
        source: "YouTube Data API v3",
        message: "YOUTUBE_API_KEY is not configured in the server environment.",
      };
    }

    const rawQuery = typeof args.query === "string" ? args.query.trim() : "";
    if (!rawQuery) return { status: "error", source: "YouTube Data API v3", message: "A search query is required." };

    const requestedLimit = Math.min(Math.max(Number(args.limit) || 10, 1), 10);
    const filterNoWebsite = wantsNoWebsite(rawQuery);
    const queries = filterNoWebsite ? candidateQueries(rawQuery) : [rawQuery];
    const region = typeof args.region_code === "string" && /^[A-Za-z]{2}$/.test(args.region_code.trim())
      ? args.region_code.trim().toUpperCase()
      : wantsIndia(rawQuery) ? "IN" : "";
    const mode = args.type === "video" ? "video" : "channel";

    // Video requests remain a single direct YouTube search.
    if (mode === "video") {
      const params = new URLSearchParams({
        part: "snippet",
        q: rawQuery,
        type: "video",
        maxResults: String(requestedLimit),
        key: apiKey,
      });
      if (region) params.set("regionCode", region);
      const data = await youtubeJson(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
      const items: YouTubeItem[] = Array.isArray(data.items) ? data.items : [];
      return {
        status: "success",
        source: "YouTube Data API v3",
        query: rawQuery,
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

    const collectedIds: string[] = [];
    const seenIds = new Set<string>();
    const usedQueries: string[] = [];
    let pagesFetched = 0;
    let nextPageToken: string | undefined;

    // For no-website requests we deliberately inspect more than the requested
    // 10 channels. Website absence is an inference from public descriptions,
    // so a single 10-result page is not enough to guarantee 10 candidates.
    for (const query of queries) {
      nextPageToken = undefined;
      for (let page = 0; page < (filterNoWebsite ? 2 : 1); page += 1) {
        const data = await searchChannels(apiKey, query, region, nextPageToken);
        pagesFetched += 1;
        usedQueries.push(query);
        const items = Array.isArray(data.items) ? data.items : [];
        for (const item of items) {
          const id = item.id?.channelId;
          if (id && !seenIds.has(id)) {
            seenIds.add(id);
            collectedIds.push(id);
          }
        }
        nextPageToken = data.nextPageToken;
        if (!filterNoWebsite || collectedIds.length >= 50 || !nextPageToken) break;
      }
      if (!filterNoWebsite || collectedIds.length >= 50) break;
    }

    if (!collectedIds.length) {
      return {
        status: "success",
        source: "YouTube Data API v3",
        query: usedQueries.join(" | ") || queries.join(" | "),
        requested_query: rawQuery,
        type: "creator",
        results: [],
        candidate_count: 0,
        pages_fetched: pagesFetched,
        message: "YouTube Data API v3 returned no matching channels for the normalized search query. The API key was accepted by YouTube; this is not a missing-key response.",
      };
    }

    const channels = await loadChannels(apiKey, collectedIds);
    const channelResults = normalizeChannels(channels);
    const filtered = filterNoWebsite
      ? channelResults.filter((channel) => !channel.website_in_channel_description).slice(0, requestedLimit)
      : channelResults.slice(0, requestedLimit);

    return {
      status: "success",
      source: "YouTube Data API v3",
      query: usedQueries.filter((value, index, all) => all.indexOf(value) === index).join(" | "),
      requested_query: rawQuery,
      type: "creator",
      region_code: region || undefined,
      candidate_count: channelResults.length,
      pages_fetched: pagesFetched,
      results: filtered,
      website_filter: filterNoWebsite
        ? "Excluded channels whose public YouTube channel description contains an external website URL. Social-only links were not treated as a website."
        : undefined,
      note: filterNoWebsite && filtered.length < requestedLimit
        ? `Only ${filtered.length} matching channels were found in the inspected YouTube candidate set. YouTube Data API v3 does not expose a definitive has-website field, so website absence is inferred from the public channel description.`
        : filterNoWebsite
          ? "Website absence is inferred from the public YouTube channel description; YouTube Data API v3 does not expose a definitive has-website field."
          : undefined,
    };
  },
};
