import { sql } from "@/lib/db/neon";

const MIGRATION_VERSION = "001_production_hardening";

const statements = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS rate_limit_buckets (key TEXT PRIMARY KEY, window_started_at TIMESTAMPTZ NOT NULL, count INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `ALTER TABLE email_approvals ADD COLUMN IF NOT EXISTS send_attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE email_approvals ADD COLUMN IF NOT EXISTS sending_started_at TIMESTAMPTZ`,
  `ALTER TABLE email_approvals ADD COLUMN IF NOT EXISTS idempotency_key TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS email_approvals_idempotency_idx ON email_approvals(idempotency_key) WHERE idempotency_key IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS email_approvals_sending_idx ON email_approvals(status, sending_started_at)`,
  `CREATE INDEX IF NOT EXISTS email_approvals_recipient_idx ON email_approvals(user_id, recipient)`,
];

let migrationPromise: Promise<void> | null = null;

export function runProductionMigrations() {
  migrationPromise ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    const existing = await sql`SELECT version FROM schema_migrations WHERE version=${MIGRATION_VERSION} LIMIT 1`;
    if (existing[0]) return;
    for (const statement of statements.slice(1)) await sql.unsafe(statement);
    await sql`INSERT INTO schema_migrations(version) VALUES (${MIGRATION_VERSION}) ON CONFLICT (version) DO NOTHING`;
  })().catch((error) => {
    migrationPromise = null;
    throw error;
  });
  return migrationPromise;
}
