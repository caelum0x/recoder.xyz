-- billing_0002_usage — durable, idempotent usage events + materialized quota counters.
--
-- Usage events are the auditable per-run / per-token / per-engine record the
-- provider meter feed is derived from. The `UNIQUE (idempotency_key)` is the
-- load-bearing invariant: a retried emit with the same key is a no-op, so a
-- worker/conductor retry never double-counts. Counters materialize per
-- subject/kind/window for O(1) fail-safe headroom checks.

CREATE TABLE IF NOT EXISTS billing_usage_events (
  id              TEXT PRIMARY KEY,
  subject_id      TEXT NOT NULL,
  kind            TEXT NOT NULL,          -- cli_request|agent_run|token|publish|preview|download
  quantity        INTEGER NOT NULL DEFAULT 1,
  run_id          TEXT,                   -- links to an agent-os Run
  engine          TEXT,                   -- e.g. tensorzero|claude|codex
  idempotency_key TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  flushed_at      TIMESTAMPTZ,            -- set when pushed to the provider meter
  UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_usage_subject_kind ON billing_usage_events(subject_id, kind);
CREATE INDEX IF NOT EXISTS idx_usage_subject_kind_time ON billing_usage_events(subject_id, kind, occurred_at);
CREATE INDEX IF NOT EXISTS idx_usage_unflushed ON billing_usage_events(flushed_at) WHERE flushed_at IS NULL;

-- Materialized quota counter per subject/kind/window (fast headroom checks).
CREATE TABLE IF NOT EXISTS billing_usage_counters (
  subject_id   TEXT NOT NULL,
  kind         TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  usage_limit  INTEGER NOT NULL,         -- 0 = unlimited
  used         INTEGER NOT NULL DEFAULT 0,
  reset_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (subject_id, kind, window_start)
);
CREATE INDEX IF NOT EXISTS idx_usage_counter_reset ON billing_usage_counters(reset_at);
