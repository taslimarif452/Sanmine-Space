CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_approvals ADD COLUMN IF NOT EXISTS send_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_approvals ADD COLUMN IF NOT EXISTS sending_started_at TIMESTAMPTZ;
ALTER TABLE email_approvals ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS email_approvals_idempotency_idx ON email_approvals(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_approvals_sending_idx ON email_approvals(status, sending_started_at);

CREATE INDEX IF NOT EXISTS email_approvals_recipient_idx ON email_approvals(user_id, recipient);
