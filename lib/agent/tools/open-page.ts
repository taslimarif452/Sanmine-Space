import type { AgentTool } from "@/lib/agent/tools/types";

function isSafePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const openPageTool: AgentTool = {
  name: "open_page",
  description:
    "Open a public web page URL and extract readable page text plus basic metadata. Use this after search_web when you need to inspect a specific website.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The public HTTP or HTTPS URL to inspect." },
      max_chars: { type: "number", description: "Maximum extracted text length, from 1000 to 12000." },
    },
    required: ["url"],
  },
  execute: async (args) => {
    const url = typeof args.url === "string" ? args.url.trim() : "";
    const maxChars = Math.min(Math.max(Number(args.max_chars) || 8000, 1000), 12000);
    if (!isSafePublicUrl(url)) return { status: "error", message: "Only public HTTP/HTTPS URLs are supported." };

    const response = await fetch(url, {
      headers: { "User-Agent": "SanmineSpaceBot/1.0 (+web-research)" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) throw new Error(`Page fetch failed (${response.status}).`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return { status: "error", message: "The URL did not return a readable HTML/text page.", content_type: contentType };
    }

    const html = await response.text();
    const text = stripHtml(html).slice(0, maxChars);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

    return {
      status: "success",
      url: response.url,
      title: titleMatch ? stripHtml(titleMatch[1]) : "",
      text,
      truncated: stripHtml(html).length > maxChars,
    };
  },
};
