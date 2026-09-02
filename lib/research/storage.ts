import { sql } from "@/lib/db/neon";

type ResearchLead = {
  name: string;
  email?: string | null;
  website_url?: string | null;
  country?: string | null;
  niche?: string | null;
  youtube_channel_id?: string | null;
  youtube_url?: string | null;
  subscribers?: string | number | null;
  total_views?: string | number | null;
  description?: string | null;
  evidence?: Record<string, unknown>;
  sources?: Array<{ url: string; title?: string; snippet?: string; source_type?: string }>;
};

export function normalizeEmail(value?: string | null) {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizeDomain(value?: string | null) {
  if (!value?.trim()) return null;
  try {
    const url = value.includes("://") ? value : `https://${value}`;
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch { return null; }
}

export function normalizeYouTube(value?: string | null) {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

export function scoreContactConfidence(lead: ResearchLead) {
  const email = normalizeEmail(lead.email);
  if (!email) return { score: 0, reasons: ["No verified public contact email supplied"] };
  const reasons: string[] = [];
  let score = 45;
  const domain = normalizeDomain(lead.website_url);
  const emailDomain = email.split("@")[1];
  if (domain && emailDomain === domain) { score += 35; reasons.push("Email domain matches verified website domain"); }
  else { score += 10; reasons.push("Public business/contact email found"); }
  if (!/^(noreply|no-reply|support|privacy|legal|abuse)@/i.test(email)) { score += 15; reasons.push("Address appears suitable for business outreach"); }
  return { score: Math.min(100, score), reasons };
}

export function scoreLead(lead: ResearchLead, websiteVerified: boolean, contactScore: number) {
  let score = 20;
  const reasons: string[] = [];
  const subscribers = Number(lead.subscribers || 0);
  const views = Number(lead.total_views || 0);
  if (websiteVerified) { score += 20; reasons.push("Website verified"); }
  if (contactScore >= 70) { score += 20; reasons.push("High-confidence contact"); }
  else if (contactScore >= 40) { score += 10; reasons.push("Usable public contact"); }
  if (subscribers >= 100000) { score += 20; reasons.push("100k+ subscribers"); }
  else if (subscribers >= 10000) { score += 12; reasons.push("10k+ subscribers"); }
  else if (subscribers >= 1000) { score += 6; reasons.push("1k+ subscribers"); }
  if (views >= 10000000) { score += 15; reasons.push("10M+ total views"); }
  else if (views >= 1000000) { score += 10; reasons.push("1M+ total views"); }
  if (lead.niche) { score += 5; reasons.push("Niche/category identified"); }
  return { score: Math.min(100, score), reasons };
}

export async function verifyWebsite(url: string) {
  const normalized = normalizeDomain(url);
  if (!normalized) return { verified: false, status: null, finalUrl: null, title: null, description: null };
  const candidates = [url.startsWith("http") ? url : `https://${url}`];
  if (!/^https?:\/\//i.test(candidates[0])) candidates.push(`http://${normalized}`);
  for (const candidate of candidates) {
    try {
      let response = await fetch(candidate, { method: "HEAD", redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok || response.status === 405) response = await fetch(candidate, { method: "GET", redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(8000) });
      const contentType = response.headers.get("content-type") || "";
      let title: string | null = null;
      let description: string | null = null;
      if (contentType.includes("text/html")) {
        const html = (await response.text()).slice(0, 500_000);
        title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
        description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim() || null;
      }
      return { verified: response.status >= 200 && response.status < 400, status: response.status, finalUrl: response.url || candidate, title, description };
    } catch { /* try the next scheme */ }
  }
  return { verified: false, status: null, finalUrl: null, title: null, description: null };
}

export async function saveResearch(userId: string, query: string, source: string, leads: ResearchLead[], metadata: Record<string, unknown> = {}) {
  const runRows = await sql`INSERT INTO research_runs (user_id, query, source, status, result_count, metadata, completed_at) VALUES (${userId}, ${query}, ${source}, 'completed', ${leads.length}, ${JSON.stringify(metadata)}, NOW()) RETURNING id`;
  const runId = String(runRows[0].id);
  const saved: Array<Record<string, unknown>> = [];
  for (let index = 0; index < leads.length; index += 1) {
    const lead = leads[index];
    const email = normalizeEmail(lead.email);
    const domain = normalizeDomain(lead.website_url);
    const youtube = normalizeYouTube(lead.youtube_channel_id || lead.youtube_url);
    const website = lead.website_url ? await verifyWebsite(lead.website_url) : { verified: false, status: null, finalUrl: null, title: null, description: null };
    const contact = scoreContactConfidence(lead);
    const scoring = scoreLead(lead, website.verified, contact.score);
    const subscribers = Number.isFinite(Number(lead.subscribers)) ? Math.max(0, Math.trunc(Number(lead.subscribers))) : null;
    const views = Number.isFinite(Number(lead.total_views)) ? Math.max(0, Math.trunc(Number(lead.total_views))) : null;
    const rows = await sql`
      INSERT INTO leads (user_id, name, email, website_url, website_verified, website_status, website_verified_at, website_title, website_description, website_final_url, country, niche, youtube_channel_id, youtube_url, subscribers, total_views, contact_confidence, lead_score, score_reasons, normalized_email, normalized_domain, normalized_youtube, last_researched_at, updated_at)
      VALUES (${userId}, ${lead.name.trim()}, ${email}, ${lead.website_url || null}, ${website.verified}, ${website.status}, ${website.verified ? new Date() : null}, ${website.title}, ${website.description}, ${website.finalUrl}, ${lead.country || null}, ${lead.niche || null}, ${lead.youtube_channel_id || null}, ${lead.youtube_url || null}, ${subscribers}, ${views}, ${contact.score}, ${scoring.score}, ${JSON.stringify([...contact.reasons, ...scoring.reasons])}, ${email}, ${domain}, ${youtube}, NOW(), NOW())
      ON CONFLICT DO UPDATE SET
        name=EXCLUDED.name, email=COALESCE(EXCLUDED.email, leads.email), website_url=COALESCE(EXCLUDED.website_url, leads.website_url), website_verified=EXCLUDED.website_verified OR leads.website_verified, website_status=EXCLUDED.website_status, website_verified_at=EXCLUDED.website_verified_at, website_title=COALESCE(EXCLUDED.website_title, leads.website_title), website_description=COALESCE(EXCLUDED.website_description, leads.website_description), website_final_url=COALESCE(EXCLUDED.website_final_url, leads.website_final_url), country=COALESCE(EXCLUDED.country, leads.country), niche=COALESCE(EXCLUDED.niche, leads.niche), youtube_channel_id=COALESCE(EXCLUDED.youtube_channel_id, leads.youtube_channel_id), youtube_url=COALESCE(EXCLUDED.youtube_url, leads.youtube_url), subscribers=COALESCE(EXCLUDED.subscribers, leads.subscribers), total_views=COALESCE(EXCLUDED.total_views, leads.total_views), contact_confidence=GREATEST(EXCLUDED.contact_confidence, leads.contact_confidence), lead_score=GREATEST(EXCLUDED.lead_score, leads.lead_score), score_reasons=EXCLUDED.score_reasons, normalized_email=COALESCE(EXCLUDED.normalized_email, leads.normalized_email), normalized_domain=COALESCE(EXCLUDED.normalized_domain, leads.normalized_domain), normalized_youtube=COALESCE(EXCLUDED.normalized_youtube, leads.normalized_youtube), last_researched_at=NOW(), updated_at=NOW()
      RETURNING *
    `;
    const leadId = String(rows[0].id);
    await sql`INSERT INTO research_leads (research_run_id, lead_id, rank, evidence) VALUES (${runId}, ${leadId}, ${index + 1}, ${JSON.stringify(lead.evidence || {})}) ON CONFLICT (research_run_id, lead_id) DO UPDATE SET rank=EXCLUDED.rank, evidence=EXCLUDED.evidence`;
    for (const sourceRow of lead.sources || []) {
      if (!sourceRow.url) continue;
      await sql`INSERT INTO research_sources (research_run_id, lead_id, url, title, snippet, source_type) VALUES (${runId}, ${leadId}, ${sourceRow.url}, ${sourceRow.title || null}, ${sourceRow.snippet || null}, ${sourceRow.source_type || "web"})`;
    }
    saved.push({ id: leadId, name: rows[0].name, website_verified: rows[0].website_verified, contact_confidence: rows[0].contact_confidence, lead_score: rows[0].lead_score });
  }
  return { research_run_id: runId, leads: saved, count: saved.length };
}
