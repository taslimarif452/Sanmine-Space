CREATE TABLE IF NOT EXISTS campaign_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order >= 1),
  delay_minutes INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, step_order)
);

CREATE TABLE IF NOT EXISTS suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'manual',
  source TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, email)
);

CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  approval_id UUID REFERENCES email_approvals(id) ON DELETE SET NULL,
  recipient TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent','delivered','opened','clicked','replied','bounced','failed','unsubscribed')),
  provider_message_id TEXT,
  provider_thread_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 1,
  next_step_at TIMESTAMPTZ,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','replied','bounced','suppressed','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, recipient)
);

CREATE INDEX IF NOT EXISTS email_events_campaign_idx ON email_events(campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS email_events_recipient_idx ON email_events(user_id, recipient, occurred_at DESC);
CREATE INDEX IF NOT EXISTS campaign_contacts_due_idx ON campaign_contacts(campaign_id, state, next_step_at);
CREATE INDEX IF NOT EXISTS suppression_user_email_idx ON suppression_list(user_id, email);
