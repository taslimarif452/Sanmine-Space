import { sql } from "@/lib/db/neon";

const MIGRATION_VERSION = "001_production_hardening";

const statements = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, image TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS chats (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT 'New chat', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('user','assistant')), content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS email_connections (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL CHECK (provider IN ('google','microsoft')), provider_account_id TEXT, email TEXT NOT NULL, display_name TEXT, access_token TEXT NOT NULL, refresh_token TEXT, expires_at BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, provider, email))`,
  `CREATE TABLE IF NOT EXISTS campaigns (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, connection_id UUID NOT NULL REFERENCES email_connections(id) ON DELETE RESTRICT, name TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')), start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), interval_minutes INTEGER NOT NULL DEFAULT 60 CHECK (interval_minutes >= 1), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS email_approvals (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, connection_id UUID NOT NULL REFERENCES email_connections(id) ON DELETE CASCADE, campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','sending','sent','failed','send_unknown')), scheduled_at TIMESTAMPTZ, approved_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, provider_message_id TEXT, error TEXT, send_attempts INTEGER NOT NULL DEFAULT 0, sending_started_at TIMESTAMPTZ, idempotency_key TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS rate_limit_buckets (key TEXT PRIMARY KEY, window_started_at TIMESTAMPTZ NOT NULL, count INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS chats_user_updated_idx ON chats(user_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS messages_chat_created_idx ON messages(chat_id, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS email_connections_user_idx ON email_connections(user_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS email_approvals_user_status_idx ON email_approvals(user_id, status, scheduled_at ASC)`,
  `CREATE INDEX IF NOT EXISTS email_approvals_campaign_idx ON email_approvals(campaign_id, scheduled_at ASC)`,
  `CREATE INDEX IF NOT EXISTS email_approvals_sending_idx ON email_approvals(status, sending_started_at)`,
  `CREATE INDEX IF NOT EXISTS email_approvals_recipient_idx ON email_approvals(user_id, recipient)`,
  `CREATE INDEX IF NOT EXISTS campaigns_user_status_idx ON campaigns(user_id, status, updated_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS email_approvals_idempotency_idx ON email_approvals(idempotency_key) WHERE idempotency_key IS NOT NULL`,
  `DO $$ DECLARE constraint_name TEXT; BEGIN SELECT conname INTO constraint_name FROM pg_constraint WHERE conrelid='email_approvals'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%'; IF constraint_name IS NOT NULL THEN EXECUTE format('ALTER TABLE email_approvals DROP CONSTRAINT %I', constraint_name); END IF; ALTER TABLE email_approvals ADD CONSTRAINT email_approvals_status_check CHECK (status IN ('pending','approved','rejected','sending','sent','failed','send_unknown')); END $$`,
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
