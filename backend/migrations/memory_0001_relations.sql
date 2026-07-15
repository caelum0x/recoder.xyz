-- memory_0001_relations.sql
-- Phase 8 (Memory & Retrieval) — the ONE table this domain owns.
--
-- Conflict #3 resolution: the `memory_items` / `memory_candidates` tables are
-- owned by agent-os (agentos_* migrations); the memory domain consumes them
-- through the agent-os repository port and adds ONLY `memory_relations` here —
-- the edge graph that powers `relate(from, to, kind)`
-- (supersedes / derived-from / contradicts / relates-to).
--
-- Tenancy is app-layer (WHERE user_id = :user_id) — NO Supabase RLS / auth.uid().
-- The persistence migration runner sorts *.sql lexically and splits on every
-- top-level `;` (it is NOT dollar-quote aware), so this file uses only single,
-- idempotent statements — no plpgsql function bodies, no triggers.
--
-- No FK to memory_items: relations are validated at the app layer and must stay
-- insertable even when the referenced item lives in an agent-os-owned table that
-- may migrate independently. Orphan edges are pruned by the lifecycle service.

CREATE TABLE IF NOT EXISTS memory_relations (
  relation_id     TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  from_memory_id  TEXT NOT NULL,
  to_memory_id    TEXT NOT NULL,
  kind            TEXT NOT NULL,   -- supersedes | derived-from | contradicts | relates-to
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_memory_id, to_memory_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_memory_relations_from ON memory_relations (from_memory_id);

CREATE INDEX IF NOT EXISTS idx_memory_relations_user ON memory_relations (user_id, from_memory_id);
