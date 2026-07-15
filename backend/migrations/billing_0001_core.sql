-- billing_0001_core — Merchant-of-Record subscription + invoice + webhook projections.
--
-- These tables are PROJECTIONS of webhook-confirmed provider state (Polar /
-- Creem / Paddle / Dodo). They are never written from an unauthenticated path;
-- the webhook route signature-verifies before the reconcile loop upserts here.
-- Access control is app-layer only (`WHERE subject_id = :subjectId`) — no RLS.

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                   TEXT PRIMARY KEY,
  subject_id           TEXT NOT NULL,                 -- user_id or org_id
  subject_kind         TEXT NOT NULL DEFAULT 'user',  -- user|org
  plan                 TEXT NOT NULL,                 -- free|pro|team|max|enterprise
  provider             TEXT NOT NULL,                 -- polar|creem|paddle|dodo
  provider_customer_id TEXT,
  provider_sub_id      TEXT,
  status               TEXT NOT NULL,                 -- active|past_due|canceled|trialing
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_sub_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_sub_subject ON billing_subscriptions(subject_id);
CREATE INDEX IF NOT EXISTS idx_billing_sub_subject_status ON billing_subscriptions(subject_id, status);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id                  TEXT PRIMARY KEY,
  subject_id          TEXT NOT NULL,
  provider            TEXT NOT NULL,                  -- polar|creem|paddle|dodo
  provider_invoice_id TEXT NOT NULL,
  amount_cents        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'usd',
  status              TEXT NOT NULL,                  -- paid|open|void|uncollectible
  hosted_url          TEXT,
  pdf_url             TEXT,
  issued_at           TIMESTAMPTZ NOT NULL,
  UNIQUE (provider, provider_invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_inv_subject ON billing_invoices(subject_id);

-- Webhook idempotency + audit: one row per provider event; the PK dedupes retries.
CREATE TABLE IF NOT EXISTS billing_webhook_events (
  event_id     TEXT NOT NULL,
  provider     TEXT NOT NULL,                         -- polar|creem|paddle|dodo
  type         TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  PRIMARY KEY (provider, event_id)
);
