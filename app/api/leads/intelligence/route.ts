import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { sql } from "@/lib/db/neon";
import { runProductionMigrations } from "@/lib/db/migrations";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { errorResponse, errorStatus } from "@/lib/api/errors";
import { z } from "zod";

const Body = z.object({ query: z.string().trim().min(2).max(300) });

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    await runProductionMigrations();
    await enforceRateLimit(`lead:intelligence:${user.uid}`, 20, 60_000);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "A search query is required." }, { status: 400 });

    const sources: { source: string; title: string; url: string; snippet: string }[] = [];
    const tavily = process.env.TAVILY_API_KEY?.trim();
    if (tavily) {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavily, query: parsed.data.query, max_results: 8, search_depth: "advanced", include_answer: false }),
        cache: "no-store",
      });
      if (r.ok) {
        const d = await r.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
        for (const x of d.results ?? []) sources.push({ source: "web", title: x.title || "Web source", url: x.url || "", snippet: x.content || "" });
      }
    }

    const yt = process.env.YOUTUBE_API_KEY?.trim();
    if (yt) {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=10&q=${encodeURIComponent(parsed.data.query)}&key=${encodeURIComponent(yt)}`, { cache: "no-store" });
      if (r.ok) {
        const d = await r.json() as { items?: Array<{ id?: { channelId?: string }; snippet?: { title?: string; description?: string } }> };
        for (const x of d.items ?? []) {
          if (x.id?.channelId) sources.push({ source: "youtube", title: x.snippet?.title || "YouTube channel", url: `https://www.youtube.com/channel/${x.id.channelId}`, snippet: x.snippet?.description || "" });
        }
      }
    }

    const run = await sql`INSERT INTO research_runs(user_id,query,source,status,result_count,metadata,completed_at) VALUES(${user.uid},${parsed.data.query},'multi_source','completed',${sources.length},${JSON.stringify({ sources: sources.map((s) => s.source) })},NOW()) RETURNING *`;
    for (const s of sources.slice(0, 30)) {
      await sql`INSERT INTO research_sources(research_run_id,url,title,snippet,source_type) VALUES(${(run[0] as any).id},${s.url || "https://example.invalid"},${s.title},${s.snippet},${s.source})`;
    }
    return NextResponse.json({ run: run[0], sources });
  } catch (error) {
    return NextResponse.json(errorResponse(error, "Unable to run multi-source intelligence."), { status: errorStatus(error) });
  }
}
