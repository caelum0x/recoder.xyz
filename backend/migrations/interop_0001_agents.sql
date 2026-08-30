-- interop_0001_agents.sql
-- Phase 7a (A2A & Interop Runtimes — wire slice) — the registry of A2A agents /
-- runtime endpoints this instance knows about, plus their liveness heartbeats.
--
-- OWNERSHIP: the interop-wire domain owns `interop_agents` + `interop_heartbeats`.
-- These are a PROJECTION for routing/liveness; the canonical Task/Run/approval
-- state-of-record lives in the agent-os domain. Rows are persisted so a backend
-- restart can re-resolve registered agents and re-probe their heartbeat SLO
-- (see interop_0002_tasks_scratchpad.sql for the task projection).
--
-- Access is app-layer tenant-scoped (WHERE user_id = :user_id) — NO Supabase RLS
-- / auth.uid(). The persistence migration runner sorts *.sql lexically, so
-- `interop_*` applies after every `NNNN_*` core migration; it needs only the core
-- extensions from 0000 and references no other domain table. Every statement is
-- idempotent.

CREATE TABLE IF NOT EXISTS interop_agents (
  id            TEXT NOT NULL,                  -- agent id / card id (owner-scoped)
  user_id       TEXT NOT NULL,
  kind          TEXT NOT NULL,                  -- 'runtime' | 'remote_a2a' | 'connector'
  runtime_id    TEXT,                           -- ConductorRuntimeId when kind='runtime'
  card          JSONB NOT NULL DEFAULT '{}'::jsonb, -- agent-card (capabilities, endpoints)
  public_key    TEXT,                           -- ed25519 pubkey for envelope verify
  status        TEXT NOT NULL DEFAULT 'unknown',-- up|down|degraded|unknown
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_interop_agents_user ON interop_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_interop_agents_kind ON interop_agents(kind);

CREATE TABLE IF NOT EXISTS interop_heartbeats (
  agent_id      TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  latency_ms    INTEGER,
  ok            BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (agent_id, user_id, seen_at),
  FOREIGN KEY (agent_id, user_id) REFERENCES interop_agents(id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_interop_hb_seen ON interop_heartbeats(seen_at);
