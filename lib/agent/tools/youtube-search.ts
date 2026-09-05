import type { AgentTool } from "@/lib/agent/tools/types";
import { runProductionMigrations } from "@/lib/db/migrations";
import { saveResearch } from "@/lib/research/storage";

type YouTubeItem = { id?: { channelId?: string; videoId?: string }; snippet?: { title?: string; description?: string; channelId?: string; channelTitle?: string; publishedAt?: string; thumbnails?: { high?: { url?: string }; default?: { url?: string } }; country?: string } };
type YouTubeChannel = { id?: string; snippet?: { title?: string; description?: string; publishedAt?: string; country?: string; customUrl?: string }; statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string } };
type SearchResponse = { items?: YouTubeItem[]; nextPageToken?: string };
const WEBSITE_URL_RE = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SOCIAL_HOSTS = new Set(["youtube.com", "youtu.be", "instagram.com", "facebook.com", "fb.com", "twitter.com", "x.com", "linkedin.com", "t.me", "telegram.me", "discord.com", "discord.gg", "tiktok.com"]);
function cleanUrl(value: string) { return value.replace(/[.,!?;:]+$/, ""); }
function extractPublicEmail(description = "") { const matches = description.match(EMAIL_RE) ?? []; return [...new Set(matches.map((value) => value.trim().toLowerCase()))][0]; }
function hasExternalWebsite(description = "") { const urls = description.match(WEBSITE_URL_RE)?.map(cleanUrl) ?? []; return urls.some((raw) => { try { const host = new URL(raw.startsWith("www.") ? `https://${raw}` : raw).hostname.toLowerCase().replace(/^www\./, ""); return !SOCIAL_HOSTS.has(host); } catch { return false; } }); }
function wantsNoWebsite(query: string) { return /no\s+(a\s+)?website|without\s+(a\s+)?website|website\s*(nahi|nahin|nhi|nh)|website\s*(is\s*)?not/i.test(query); }
function wantsContactEmail(query: string) { return /contact\s*email|email\s*(available|in|on|from|for)|email\s*(in|on)\s*(the\s*)?(channel\s*)?description|description.*email/i.test(query); }
function wantsIndia(query: string) { return /\bindia\b|\bindian\b|bharat|bhartiya/i.test(query); }
function candidateQueries(query: string) {
  if (wantsIndia(query)) return ["Indian YouTuber", "Indian content creator", "Indian creator", "Indian tech YouTuber", "Indian education YouTuber", "Indian gaming YouTuber", "Indian vlogger", "Indian finance YouTuber", "Indian business YouTuber", "Indian fitness YouTuber", "Indian travel YouTuber", "Indian food YouTuber", "Indian news YouTuber", "Indian comedy YouTuber", "Indian lifestyle YouTuber"];
  return ["YouTube creator", "YouTuber", "content creator", "YouTube channel", "creator channel"];
}
async function youtubeJson(url: string, timeoutMs = 12000) { const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) }); const data = await response.json().catch(() => ({})); if (!response.ok) { const reason = data?.error?.errors?.[0]?.reason; throw new Error(`${data?.error?.message || `YouTube API request failed (${response.status}).`}${reason ? ` [${reason}]` : ""}`); } return data; }
async function searchChannels(apiKey: string, query: string, region: string, pageToken?: string): Promise<SearchResponse> { const params = new URLSearchParams({ part: "snippet", q: query, type: "channel", maxResults: "50", key: apiKey }); if (region) params.set("regionCode", region); if (pageToken) params.set("pageToken", pageToken); return youtubeJson(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`) as Promise<SearchResponse>; }
async function loadChannels(apiKey: string, channelIds: string[]) { const output: YouTubeChannel[] = []; for (let i = 0; i < channelIds.length; i += 50) { const batch = channelIds.slice(i, i + 50); if (!batch.length) continue; const params = new URLSearchParams({ part: "snippet,statistics", id: batch.join(","), key: apiKey }); const data = await youtubeJson(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`); if (Array.isArray(data.items)) output.push(...(data.items as YouTubeChannel[])); } return output; }
function normalizeChannels(channels: YouTubeChannel[]) { return channels.map((channel) => { const description = String(channel.snippet?.description || ""); return { channel_id: channel.id, creator_name: channel.snippet?.title, description, contact_email: extractPublicEmail(description), published_at: channel.snippet?.publishedAt, country: channel.snippet?.country, custom_url: channel.snippet?.customUrl, subscribers: channel.statistics?.subscriberCount, videos: channel.statistics?.videoCount, total_views: channel.statistics?.viewCount, url: channel.id ? `https://www.youtube.com/channel/${channel.id}` : undefined, website_in_channel_description: hasExternalWebsite(description) }; }); }

export const youtubeSearchTool: AgentTool = {
  name: "youtube_search",
  description: "Search YouTube directly with the official YouTube Data API v3. For creator/channel requests, search a broad candidate pool, inspect public channel descriptions, and return creator/channel metadata and statistics. When the user asks for creators without a website, a public contact email in the channel description, an Indian audience/creator requirement, or minimum/maximum counts, enforce every criterion. Keep searching additional YouTube candidates and query variations until the requested minimum can be reached or the inspected candidate pool is genuinely exhausted. Never return a candidate that fails an explicit filter just to fill the requested count. Creator research is automatically persisted for the authenticated user when user_id is supplied.",
  parameters: { type: "object", properties: { user_id: { type: "string", description: "Authenticated user id supplied by the runtime." }, query: { type: "string", description: "YouTube search query or creator niche." }, limit: { type: "number", description: "Maximum number of results, from 1 to 10." }, region_code: { type: "string", description: "Optional two-letter country code such as IN or US." }, type: { type: "string", enum: ["creator", "channel", "video"], description: "Return creators/channels or videos. Use creator/channel for creator-finding requests." } }, required: ["query"] },
  execute: async (args) => {
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) return { status: "not_configured", source: "YouTube Data API v3", message: "YOUTUBE_API_KEY is not configured in the server environment." };
    const rawQuery = typeof args.query === "string" ? args.query.trim() : "";
    if (!rawQuery) return { status: "error", source: "YouTube Data API v3", message: "A search query is required." };
    const requestedLimit = Math.min(Math.max(Number(args.limit) || 10, 1), 10);
    const minimumMatch = Math.min(requestedLimit, Math.max(1, Number(rawQuery.match(/(?:minimum|min(?:imum)?|at\s+least)\s*(?:of\s*)?(\d{1,2})/i)?.[1] || rawQuery.match(/(\d{1,2})\s*(?:se\s*)?(?:kam|less|or\s*fewer)/i)?.[1] || 1)));
    const filterNoWebsite = wantsNoWebsite(rawQuery);
    const requireEmail = wantsContactEmail(rawQuery) || filterNoWebsite && /contact|email/i.test(rawQuery);
    const requireIndia = wantsIndia(rawQuery);
    const queries = filterNoWebsite || requireIndia ? candidateQueries(rawQuery) : [rawQuery];
    const region = typeof args.region_code === "string" && /^[A-Za-z]{2}$/.test(args.region_code.trim()) ? args.region_code.trim().toUpperCase() : requireIndia ? "IN" : "";
    const mode = args.type === "video" ? "video" : "channel";
    if (mode === "video") {
      const params = new URLSearchParams({ part: "snippet", q: rawQuery, type: "video", maxResults: String(requestedLimit), key: apiKey }); if (region) params.set("regionCode", region); const data = await youtubeJson(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`); const items: YouTubeItem[] = Array.isArray(data.items) ? data.items : [];
      return { status: "success", source: "YouTube Data API v3", query: rawQuery, requested_query: rawQuery, type: "video", results: items.map((item) => ({ video_id: item.id?.videoId, title: item.snippet?.title, description: item.snippet?.description, channel_id: item.snippet?.channelId, channel_title: item.snippet?.channelTitle, published_at: item.snippet?.publishedAt, url: item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : undefined, channel_url: item.snippet?.channelId ? `https://www.youtube.com/channel/${item.snippet.channelId}` : undefined })) };
    }
    const collectedIds: string[] = []; const seenIds = new Set<string>(); const usedQueries: string[] = []; let pagesFetched = 0;
    const maxPagesPerQuery = filterNoWebsite || requireIndia ? 5 : 1;
    const targetCandidatePool = filterNoWebsite || requireIndia ? Math.max(250, minimumMatch * 30) : requestedLimit;
    for (const query of queries) {
      let nextPageToken: string | undefined;
      for (let page = 0; page < maxPagesPerQuery; page += 1) {
        const data = await searchChannels(apiKey, query, region, nextPageToken); pagesFetched += 1; usedQueries.push(query);
        for (const item of Array.isArray(data.items) ? data.items : []) { const id = item.id?.channelId; if (id && !seenIds.has(id)) { seenIds.add(id); collectedIds.push(id); } }
        nextPageToken = data.nextPageToken;
        if (collectedIds.length >= targetCandidatePool || !nextPageToken) break;
      }
      if (collectedIds.length >= targetCandidatePool) break;
    }
    if (!collectedIds.length) return { status: "success", source: "YouTube Data API v3", query: usedQueries.join(" | ") || queries.join(" | "), requested_query: rawQuery, type: "creator", results: [], candidate_count: 0, matching_count: 0, minimum_required: minimumMatch, pages_fetched: pagesFetched, message: "YouTube Data API v3 returned no channels for the requested search." };
    const channels = await loadChannels(apiKey, collectedIds);
    const channelResults = normalizeChannels(channels);
    const filtered = channelResults.filter((channel) => {
      if (requireIndia && String(channel.country || "").toUpperCase() !== "IN") return false;
      if (filterNoWebsite && channel.website_in_channel_description) return false;
      if (requireEmail && !channel.contact_email) return false;
      return true;
    }).slice(0, requestedLimit);
    const response = {
      status: "success", source: "YouTube Data API v3", query: usedQueries.filter((value, index, all) => all.indexOf(value) === index).join(" | "), requested_query: rawQuery, type: "creator", region_code: region || undefined,
      candidate_count: channelResults.length, matching_count: filtered.length, minimum_required: minimumMatch, pages_fetched: pagesFetched, results: filtered,
      criteria: { indian_creator_country_verified: requireIndia, no_external_website_in_channel_description: filterNoWebsite, public_contact_email_in_channel_description: requireEmail },
      website_filter: filterNoWebsite ? "Excluded channels whose public YouTube channel description contains an external website URL. Social-only links were not treated as a website." : undefined,
      email_filter: requireEmail ? "Only channels with a publicly listed email address in the channel description are included." : undefined,
      country_filter: requireIndia ? "Only channels whose YouTube channel country is explicitly IN are included. Channels without a verified IN country are not counted as Indian." : undefined,
      minimum_requirement_met: filtered.length >= minimumMatch,
      note: filtered.length < minimumMatch ? `Only ${filtered.length} verified matching channels were found after inspecting ${pagesFetched} YouTube result pages. The tool will not fill the list with creators that fail the requested filters.` : `Found ${filtered.length} verified matching creators; all returned creators satisfy the requested filters.`
    };
    const userId = typeof args.user_id === "string" ? args.user_id.trim() : "";
    if (userId && filtered.length) {
      try {
        await runProductionMigrations();
        await saveResearch(userId, rawQuery, "YouTube Data API v3", filtered.map((channel) => ({ name: String(channel.creator_name || "Creator"), country: channel.country, niche: rawQuery, youtube_channel_id: channel.channel_id, youtube_url: channel.url, subscribers: channel.subscribers, total_views: channel.total_views, description: channel.description, contact_email: channel.contact_email, evidence: { website_in_channel_description: channel.website_in_channel_description, public_email_in_channel_description: Boolean(channel.contact_email), country_verified_in_youtube: String(channel.country || "").toUpperCase() === "IN" }, sources: channel.url ? [{ url: channel.url, title: String(channel.creator_name || "YouTube channel"), snippet: String(channel.description || ""), source_type: "youtube" }] : [] })), { region_code: region, website_filter: filterNoWebsite, email_filter: requireEmail, country_filter: requireIndia, pages_fetched: pagesFetched, minimum_required: minimumMatch });
      } catch (error) { return { ...response, persistence_warning: error instanceof Error ? error.message : "Research results could not be persisted." }; }
    }
    return response;
  },
};