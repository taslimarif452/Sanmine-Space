import type { AgentTool } from "@/lib/agent/tools/types";

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

export const searchWebTool: AgentTool = {
  name: "search_web",
  description:
    "Search the public internet for current businesses, websites, people, products, or factual information. Use this when online research is needed. Return source URLs and concise snippets.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "A focused web search query." },
      limit: { type: "number", description: "Number of results, from 1 to 10." },
    },
    required: ["query"],
  },
  execute: async (args) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return {
        status: "not_configured",
        message: "TAVILY_API_KEY is not configured. Add it to the server environment before using web search.",
      };
    }

    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
    if (!query) return { status: "error", message: "A search query is required." };

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: limit,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Web search failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }

    const data = (await response.json()) as { results?: TavilyResult[] };
    const results = (data.results ?? []).map((result) => ({
      title: result.title ?? "Untitled",
      url: result.url ?? "",
      snippet: result.content ?? "",
      score: result.score,
    }));

    return {
      status: "success",
      query,
      results,
      source_count: results.length,
    };
  },
};
