import type { AgentTool } from "@/lib/agent/tools/types";

function fetchPage(url: string) {
  return fetch(url, { headers: { "User-Agent": "SanmineSpaceBot/1.0 (+web-research)" }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(12000) }).then(async (response) => {
    if (!response.ok) throw new Error(`Page fetch failed (${response.status}).`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new Error("Not a readable HTML/text page.");
    return { url: response.url, html: await response.text() };
  });
}

function normalizePath(base: string, href: string): string | null {
  try {
    const url = new URL(href, base); const root = new URL(base);
    if (!["http:", "https:"].includes(url.protocol) || url.hostname !== root.hostname) return null;
    url.hash = ""; return url.toString();
  } catch { return null; }
}

function candidateLinks(html: string, base: string) {
  const found: Record<string, string> = {};
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const href = normalizePath(base, match[1]); if (!href) continue;
    const label = `${match[1]} ${match[2].replace(/<[^>]+>/g, " ")}`.toLowerCase();
    const key = label.includes("about") ? "about" : label.includes("service") ? "services" : label.includes("contact") ? "contact" : "";
    if (key && !found[key]) found[key] = href;
  }
  return found;
}

function stripHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function summarize(html: string, url: string) {
  const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const text = stripHtml(html); const lower = text.toLowerCase();
  const emails = [...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])].slice(0, 10);
  const phones = [...new Set(text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [])].slice(0, 10);
  const keywords = ["services", "about", "contact", "pricing", "book", "quote", "portfolio", "testimonials", "case studies", "appointment"];
  return { url, title, text: text.slice(0, 5000), emails, phones, signals: keywords.filter((k) => lower.includes(k)) };
}

export const websiteAnalyzeTool: AgentTool = {
  name: "website_analyze",
  description: "Analyze a public business website across its homepage and, when discoverable, About, Services, and Contact pages. Return source URLs, contact signals, page summaries, and website-quality/conversion signals.",
  parameters: { type: "object", properties: { url: { type: "string", description: "The public business website URL to analyze." } }, required: ["url"] },
  execute: async (args) => {
    const url = typeof args.url === "string" ? args.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) return { status: "error", message: "Only public HTTP/HTTPS URLs are supported." };
    const pages: Array<ReturnType<typeof summarize> & { type: string }> = [];
    let home: Awaited<ReturnType<typeof fetchPage>>;
    try { home = await fetchPage(url); } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "Website fetch failed." }; }
    const homepage = summarize(home.html, home.url); pages.push({ type: "homepage", ...homepage });
    const links = candidateLinks(home.html, home.url); const visited = new Set([home.url]);
    for (const type of ["about", "services", "contact"] as const) {
      const target = links[type]; if (!target || visited.has(target)) continue;
      try { const page = await fetchPage(target); if (!visited.has(page.url)) { pages.push({ type, ...summarize(page.html, page.url) }); visited.add(page.url); } } catch { /* inaccessible subpage */ }
    }
    const emails = [...new Set(pages.flatMap((p) => p.emails))].slice(0, 10);
    const phones = [...new Set(pages.flatMap((p) => p.phones))].slice(0, 10);
    return {
      status: "success", root_url: home.url,
      pages_scanned: pages.map(({ type, url, title }) => ({ type, url, title })),
      contact_signals: { emails, phones },
      website_signals: [...new Set(pages.flatMap((p) => p.signals))],
      pages,
      notes: [`${pages.length} page(s) inspected: homepage${pages.length > 1 ? " plus discoverable internal pages" : " only"}.`, emails.length ? "Public email address(es) detected." : "No public email address detected in fetched page text.", phones.length ? "Phone number(s) detected." : "No phone number detected in fetched page text."],
      limitation: "Lightweight public-page research, not a full security, accessibility, legal, SEO, or complete site audit.",
    };
  },
};
