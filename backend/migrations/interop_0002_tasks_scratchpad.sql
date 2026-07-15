-- interop_0002_tasks_scratchpad.sql
-- Phase 7a (A2A & Interop Runtimes — wire slice) — the A2A task lifecycle
-- projection, its message log, and the shared per-task scratchpad.
--
-- OWNERSHIP: these are a PROJECTION of A2A wire tasks for the JSON-RPC surface
-- (message/send, tasks/get, tasks/cancel) + the context-bridge scratchpad. The
-- canonical Run state-of-record stays in the agent-os domain; `run_id` links to
-- it. Persisting the projection lets `tasks/get` resume across a restart and lets
-- the scratchpad carry handoff context between agents in a delegation chain.
--
-- Access is app-layer tenant-scoped (WHERE user_id = :user_id) — NO Supabase RLS.
-- Applied after interop_0001_agents.sql (lexical order); references no other
-- domain table. Every statement idempotent.

CREATE TABLE IF NOT EXISTS interop_tasks (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  run_id        TEXT,                           -- agent-os Run id link
  runtime_id    TEXT,
  state         TEXT NOT NULL,                  -- submitted|working|input-required|completed|failed|canceled
  context_id    TEXT,                           -- A2A context/session id
  correlation   TEXT,                           -- egress correlation for A2A replies
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interop_tasks_user  ON interop_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_interop_tasks_state ON interop_tasks(state);

CREATE TABLE IF NOT EXISTS interop_task_messages (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES interop_tasks(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,                  -- user|agent|system
  parts         JSONB NOT NULL DEFAULT '[]'::jsonb, -- A2A message parts
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interop_msgs_task ON interop_task_messages(task_id);

CREATE TABLE IF NOT EXISTS interop_scratchpad (
  task_id       TEXT NOT NULL,
  seq           BIGINT NOT NULL,
  author        TEXT NOT NULL,
  note          TEXT NOT NULL,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_interop_scratch_task ON interop_scratchpad(task_id);
