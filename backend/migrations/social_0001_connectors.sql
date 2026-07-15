-- social_0001_connectors.sql
-- Phase 7b (Social Connectors) — the Recoder-owned state-of-record for channel
-- connectors and the hostile-by-default allowlist bindings.
--
-- OWNERSHIP: the social domain owns `connectors` + `channel_bindings`. Bindings
-- were previously env/in-memory; they are now DB-backed so an inbound message's
-- allowlist decision survives restarts and is auditable. A binding is
-- HOSTILE-BY-DEFAULT: `allow=false` unless an owner explicitly opted a chat_ref
-- in. `secret_ref` is a vault REFERENCE only — never the secret itself.
--
-- Access is app-layer tenant-scoped (WHERE user_id = :user_id) — NO Supabase RLS.
-- Applied after core `NNNN_*` migrations (lexical order); references no other
-- domain table. Every statement idempotent.

CREATE TABLE IF NOT EXISTS connectors (
  id            TEXT PRIMARY KEY,               -- e.g. 'telegram', 'slack'
  channel       TEXT NOT NULL,                  -- ChannelId enum value
  enabled       BOOLEAN NOT NULL DEFAULT false,
  secret_ref    TEXT,                           -- vault reference, NEVER the secret itself
  status        TEXT NOT NULL DEFAULT 'down',   -- up|down|degraded (last probe)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_bindings (
  id            TEXT PRIMARY KEY,
  connector_id  TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,                  -- Recoder owner of this binding
  space_id      TEXT,                           -- agent-os Space the inbound dispatches into
  chat_ref      TEXT NOT NULL,                  -- channel-native room/chat id (allowlisted)
  allow         BOOLEAN NOT NULL DEFAULT false, -- hostile-by-default: false unless explicitly allowed
  agent_id      TEXT,                           -- reply-agent / dispatch agent identity
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connector_id, chat_ref)
);
CREATE INDEX IF NOT EXISTS idx_channel_bindings_user ON channel_bindings(user_id);
