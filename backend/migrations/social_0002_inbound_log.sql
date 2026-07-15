-- social_0002_inbound_log.sql
-- Phase 7b (Social Connectors) — the inbound audit trail + idempotency guard.
--
-- Every inbound webhook/long-poll delivery that crosses the trust boundary is
-- logged with its GATE DECISION (admitted|rejected|ignored) and reason, so the
-- hostile-by-default edge is auditable. The unique index on
-- (connector_id, provider_msg) is the replay/idempotency guard: one provider
-- message is processed exactly once, even under platform retries.
--
-- Access is app-layer tenant-scoped (WHERE user_id = :user_id) — NO Supabase RLS.
-- Applied after social_0001_connectors.sql (lexical order). Idempotent.

CREATE TABLE IF NOT EXISTS inbound_messages (
  id            TEXT PRIMARY KEY,
  connector_id  TEXT NOT NULL,
  chat_ref      TEXT NOT NULL,
  provider_msg  TEXT NOT NULL,                  -- provider-native message id (dedup key)
  user_id       TEXT,
  decision      TEXT NOT NULL,                  -- admitted|rejected|ignored
  reason        TEXT,                           -- gate reason (audit)
  dispatch_kind TEXT,                           -- conductor|reply|none
  run_id        TEXT,                           -- conductor Run when dispatched
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotency / replay protection: one provider message processed once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_dedup
  ON inbound_messages(connector_id, provider_msg);
CREATE INDEX IF NOT EXISTS idx_inbound_user ON inbound_messages(user_id);
