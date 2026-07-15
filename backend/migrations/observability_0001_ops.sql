-- observability_0001_ops — Observability & Ops minimal durable state (Phase 11).
--
-- Observability owns NO product state; it owns *signals about* state. The only
-- durable tables it needs: SLO targets (drive /health/full rollup + alert exprs),
-- alert rules + fired events (ack audit trail), and work-signal dispositions (the
-- human decision on a stuck/blocked/needs-you signal detected by the ops-recorder
-- sidecar). Every WRITE that mutates ack/disposition state goes through the
-- governance gate at the app layer; `audit_ref` links the durable audit record.
--
-- Access is app-layer space-scoped (WHERE space_id = :spaceId) — NO Supabase RLS.
-- The persistence migration runner sorts *.sql lexically, so `observability_*`
-- applies after every `NNNN_*` core migration (needs only the 0000 extensions;
-- references no other domain table). Every statement is idempotent (IF NOT EXISTS).

-- SLO targets per service/route. `metric_query` is the prometheus expr backing the
-- objective; the aggregator reads these to compute /health/full attainment.
CREATE TABLE IF NOT EXISTS slo_targets (
  id            TEXT PRIMARY KEY,
  space_id      TEXT NOT NULL,
  name          TEXT NOT NULL,                     -- e.g. "api-latency-p99", "run-success-rate"
  target        DOUBLE PRECISION NOT NULL,         -- objective (e.g. 0.999)
  window_secs   INTEGER NOT NULL DEFAULT 3600,
  metric_query  TEXT NOT NULL,                     -- prometheus expr backing this SLO
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slo_targets_space ON slo_targets(space_id);

-- Alert rules evaluated by alerting.service. `expr` is the tiny safe grammar
-- (health.status == …, health.degraded == true, slo:<name> < <n>) — never eval'd.
CREATE TABLE IF NOT EXISTS alert_rules (
  id            TEXT PRIMARY KEY,
  space_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  expr          TEXT NOT NULL,                     -- condition over metric/health/slo
  for_secs      INTEGER NOT NULL DEFAULT 0,        -- debounce window
  notify_route  TEXT NOT NULL,                     -- herd board / notify engine target
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_space_enabled ON alert_rules(space_id, enabled);

-- Fired alert instances (audit trail; ack state). `acked_by` is the user_id of a
-- governance-gated ack; `audit_ref` links the durable governance audit record.
CREATE TABLE IF NOT EXISTS alert_events (
  id            TEXT PRIMARY KEY,
  rule_id       TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  space_id      TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('firing','acked','resolved')),
  value         DOUBLE PRECISION,
  fired_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  acked_at      TIMESTAMPTZ,
  acked_by      TEXT,                              -- user_id (governance-gated write)
  resolved_at   TIMESTAMPTZ,
  audit_ref     TEXT                               -- governance audit record id for the ack
);
CREATE INDEX IF NOT EXISTS idx_alert_events_space_status ON alert_events(space_id, status);
CREATE INDEX IF NOT EXISTS idx_alert_events_rule ON alert_events(rule_id);

-- Disposition of ops-recorder work signals (stuck/blocked/needs-you → human
-- decision). `signal_id` is the deterministic id from the sidecar; `run_id` is the
-- correlated RunEvent link. `decided_by`/`audit_ref` record the governance-gated
-- disposition write.
CREATE TABLE IF NOT EXISTS work_signal_dispositions (
  id            TEXT PRIMARY KEY,
  signal_id     TEXT NOT NULL,
  space_id      TEXT NOT NULL,
  run_id        TEXT,
  kind          TEXT NOT NULL CHECK (kind IN ('stuck','blocked','needs-you')),
  disposition   TEXT NOT NULL CHECK (disposition IN ('open','acknowledged','resolved','dismissed')),
  decided_by    TEXT,                              -- user_id (governance-gated write)
  decided_at    TIMESTAMPTZ,
  audit_ref     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wsd_signal ON work_signal_dispositions(signal_id);
CREATE INDEX IF NOT EXISTS idx_wsd_space_kind ON work_signal_dispositions(space_id, kind, disposition);
