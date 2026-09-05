"use client";

type CacheEntry = {
  url: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  savedAt: number;
};

const PREFIX = "sanmine:api-cache:v1:";
const MAX_AGE = 5 * 60 * 1000;
const MAX_STALE = 24 * 60 * 60 * 1000;
const MAX_BYTES = 900_000;

// Only cache read-only, user-scoped application data. Never cache auth, tokens,
// billing, mutations, or arbitrary API responses by default.
const CACHEABLE = [
  /^\/api\/chats(?:\/[^/?]+)?(?:\?.*)?$/,
  /^\/api\/emails(?:\/[^/?]+)?(?:\?.*)?$/,
  /^\/api\/email\/connections(?:\?.*)?$/,
  /^\/api\/plugins\/connections(?:\?.*)?$/,
  /^\/api\/leads(?:\/[^/?]+)?(?:\?.*)?$/,
  /^\/api\/research(?:\/[^/?]+)?(?:\?.*)?$/,
  /^\/api\/campaigns(?:\/[^/?]+)?(?:\?.*)?$/,
  /^\/api\/approvals(?:\/[^/?]+)?(?:\?.*)?$/,
  /^\/api\/users\/[^/?]+(?:\?.*)?$/,
];

const isBrowser = () => typeof window !== "undefined";
const isCacheable = (url: string) => {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && CACHEABLE.some((pattern) => pattern.test(parsed.pathname + parsed.search));
  } catch {
    return false;
  }
};

const keyFor = (url: string) => `${PREFIX}${url}`;

function read(url: string): CacheEntry | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(url));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry?.body || !entry.savedAt) return null;
    if (Date.now() - entry.savedAt > MAX_STALE) {
      window.localStorage.removeItem(keyFor(url));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function save(url: string, response: Response, body: string) {
  if (!isBrowser() || body.length > MAX_BYTES || !response.ok) return;
  try {
    const entry: CacheEntry = {
      url,
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()),
      body,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(keyFor(url), JSON.stringify(entry));
    window.dispatchEvent(new CustomEvent("sanmine:api-cache-updated", { detail: { url } }));
  } catch {
    // Quota/private-mode failures must never break the real request.
  }
}

function responseFromCache(entry: CacheEntry) {
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  });
}

let revalidating = new Set<string>();

async function revalidate(input: RequestInfo | URL, init: RequestInit | undefined, url: string) {
  if (revalidating.has(url)) return;
  revalidating.add(url);
  try {
    const response = await window.fetch(input, { ...init, cache: "no-store" });
    if (response.ok) save(url, response.clone(), await response.text());
  } catch {
    // Stale cache remains usable while the network is unavailable.
  } finally {
    revalidating.delete(url);
  }
}

export async function cachedApiFetch(
  originalFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET") return originalFetch(input, init);

  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!isCacheable(rawUrl)) return originalFetch(input, init);

  const url = new URL(rawUrl, window.location.origin).toString();
  const entry = read(url);
  if (entry) {
    const age = Date.now() - entry.savedAt;
    if (age > MAX_AGE) void revalidate(input, init, url);
    else {
      // Keep the cache warm without delaying the caller.
      void revalidate(input, init, url);
    }
    return responseFromCache(entry);
  }

  const response = await originalFetch(input, init);
  if (response.ok) save(url, response.clone(), await response.clone().text());
  return response;
}

export function clearApiCache() {
  if (!isBrowser()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {}
}
