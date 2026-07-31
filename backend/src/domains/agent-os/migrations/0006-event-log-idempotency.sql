-- Recoder Agent OS event-log idempotency (recoder-4euj: durability follow-up to P1 #8).
--
-- `agentos_event_log` (agentos_0004) enforced ordering (`seq` PK) but NOT
-- uniqueness on `event_id` (only a plain lookup index). Now that conductor
-- RunEvents persist durably through `PostgresAgentOsRepository.appendEvent`
-- with DETERMINISTIC eventIds, a re-emit of the same terminal event could write
-- a duplicate durable row. This migration adds the missing UNIQUE guard so the
-- append path can be a truthful `on conflict (event_id) do nothing` no-op.
--
-- Ops-safe over pre-existing data:
--  1. Dedupe first — keep the earliest-seq row per event_id, drop later copies.
--     A no-op on a clean log; harmless to re-run (no dups left to delete).
--  2. Then CREATE UNIQUE INDEX IF NOT EXISTS — cannot fail on duplicates
--     because step 1 removed them; idempotent if the index already exists.
--  3. Drop the now-redundant non-unique lookup index (the unique index serves
--     the same event_id point lookups).
--
-- splitStatements-safe: plain DDL only, full-line comments only, no dollar-quoted
-- bodies, no semicolons inside statements.

delete from agentos_event_log a
  using agentos_event_log b
  where a.event_id = b.event_id and a.seq > b.seq;

create unique index if not exists agentos_event_log_event_id_uidx
  on agentos_event_log (event_id);

drop index if exists agentos_event_log_event_id_idx;
