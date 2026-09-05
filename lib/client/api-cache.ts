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
const keyFor = (url: string, userId: string) => `${PREFIX}${encodeURIComponent(userId)}:${url}`;

function read(url: string, userId: string): CacheEntry | null {
  if (!isBrowser() || !userId) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(url, userId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry?.body || !entry.savedAt) return null;
    if (Date.now() - entry.savedAt > MAX_STALE) {
      window.localStorage.removeItem(keyFor(url, userId));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function save(url: string, userId: string, response: Response, body: string) {
  if (!isBrowser() || !userId || body.length > MAX_BYTES || !response.ok) return;
  try {
    const entry: CacheEntry = {
      url,
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()),
      body,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(keyFor(url, userId), JSON.stringify(entry));
    window.dispatchEvent(new CustomEvent("sanmine:api-cache-updated", { detail: { url } }));
  } catch {}
}

function responseFromCache(entry: CacheEntry) {
  return new Response(entry.body, { status: entry.status, statusText: entry.statusText, headers: entry.headers });
}

const revalidating = new Set<string>();

async function revalidate(
  originalFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  url: string,
  userId: string,
) {
  const lock = `${userId}:${url}`;
  if (revalidating.has(lock)) return;
  revalidating.add(lock);
  try {
    const response = await originalFetch(input, { ...init, cache: "no-store" });
    if (response.ok) save(url, userId, response.clone(), await response.text());
  } catch {
  } finally {
    revalidating.delete(lock);
  }
}

export async function cachedApiFetch(
  originalFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  userId: string,
): Promise<Response> {
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET") {
    const response = await originalFetch(input, init);
    if (response.ok) clearApiCache(userId);
    return response;
  }

  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!isCacheable(rawUrl) || !userId) return originalFetch(input, init);

  const url = new URL(rawUrl, window.location.origin).toString();
  const entry = read(url, userId);
  if (entry) {
    void revalidate(originalFetch, input, init, url, userId);
    return responseFromCache(entry);
  }

  const response = await originalFetch(input, init);
  if (response.ok) {
    const clone = response.clone();
    void clone.text().then((body) => save(url, userId, response, body));
  }
  return response;
}

export function syncApiCache(originalFetch: typeof window.fetch, userId: string, headers: HeadersInit) {
  if (!isBrowser() || !userId) return;
  const prefix = `${PREFIX}${encodeURIComponent(userId)}:`;
  try {
    const urls: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const entry = JSON.parse(raw) as CacheEntry;
      if (entry?.url && isCacheable(entry.url)) urls.push(entry.url);
    }
    urls.slice(0, 24).forEach((url) => {
      void revalidate(originalFetch, url, { headers, cache: "no-store" }, url, userId);
    });
  } catch {}
}

export function clearApiCache(userId?: string) {
  if (!isBrowser()) return;
  try {
    const prefix = userId ? `${PREFIX}${encodeURIComponent(userId)}:` : PREFIX;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {}
}
