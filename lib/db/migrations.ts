import { sql } from "@/lib/db/neon";

const MIGRATION_VERSION = "002_reliable_research";

const statements = [
  `CREATE TABLE IF NOT EXISTS research_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, query TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed')), result_count INTEGER NOT NULL DEFAULT 0, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ)`,
  `CREATE TABLE IF NOT EXISTS leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, email TEXT, website_url TEXT, website_verified BOOLEAN NOT NULL DEFAULT FALSE, website_status INTEGER, website_verified_at TIMESTAMPTZ, website_title TEXT, website_description TEXT, website_final_url TEXT, country TEXT, niche TEXT, youtube_channel_id TEXT, youtube_url TEXT, subscribers BIGINT, total_views BIGINT, contact_confidence NUMERIC(5,2) NOT NULL DEFAULT 0, lead_score NUMERIC(5,2) NOT NULL DEFAULT 0, score_reasons JSONB NOT NULL DEFAULT '[]'::jsonb, normalized_email TEXT, normalized_domain TEXT, normalized_youtube TEXT, first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_researched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS research_leads (research_run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE, lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE, rank INTEGER, evidence JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (research_run_id, lead_id))`,
  `CREATE TABLE IF NOT EXISTS research_sources (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), research_run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE, lead_id UUID REFERENCES leads(id) ON DELETE SET NULL, url TEXT NOT NULL, title TEXT, snippet TEXT, source_type TEXT NOT NULL DEFAULT 'web', fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS research_runs_user_created_idx ON research_runs(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS research_leads_lead_idx ON research_leads(lead_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS research_sources_run_idx ON research_sources(research_run_id, fetched_at DESC)`,
  `CREATE INDEX IF NOT EXISTS leads_user_updated_idx ON leads(user_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS leads_user_score_idx ON leads(user_id, lead_score DESC, last_researched_at DESC)`,
  `CREATE INDEX IF NOT EXISTS leads_user_email_idx ON leads(user_id, normalized_email)`,
  `CREATE INDEX IF NOT EXISTS leads_user_domain_idx ON leads(user_id, normalized_domain)`,
  `CREATE INDEX IF NOT EXISTS leads_user_youtube_idx ON leads(user_id, normalized_youtube)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS leads_user_email_unique_idx ON leads(user_id, normalized_email) WHERE normalized_email IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS leads_user_domain_unique_idx ON leads(user_id, normalized_domain) WHERE normalized_domain IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS leads_user_youtube_unique_idx ON leads(user_id, normalized_youtube) WHERE normalized_youtube IS NOT NULL`,
];

let migrationPromise: Promise<void> | null = null;

export function runProductionMigrations() {
  migrationPromise ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    const existing = await sql`SELECT version FROM schema_migrations WHERE version=${MIGRATION_VERSION} LIMIT 1`;
    if (existing[0]) return;
    for (const statement of statements) await sql.unsafe(statement);
    await sql`INSERT INTO schema_migrations(version) VALUES (${MIGRATION_VERSION}) ON CONFLICT (version) DO NOTHING`;
  })().catch((error) => {
    migrationPromise = null;
    throw error;
  });
  return migrationPromise;
}
