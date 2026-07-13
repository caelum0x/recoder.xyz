-- Work Signals persistence — recoder_backend database.
--
-- One row per detected WorkSignal. The primary key is the deterministic
-- 16-char SHA-256 prefix (WorkSignal.make_id), so re-syncing the same upstream
-- item upserts the same row instead of creating duplicates.
--
-- Apply with:
--   psql "$WORK_SIGNALS_DATABASE_URL" -f storage/migrations/001_work_signals.sql
-- The PostgresWorkSignalStore.initialize() also runs this DDL idempotently on
-- startup, so a fresh database is provisioned automatically.

CREATE TABLE IF NOT EXISTS work_signals (
    id                      TEXT        PRIMARY KEY,
    source                  TEXT        NOT NULL,
    item_type               TEXT        NOT NULL,
    title                   TEXT        NOT NULL,
    source_url              TEXT        NOT NULL,
    assignee                TEXT,
    status                  TEXT,
    detected_reason         TEXT        NOT NULL,
    priority                TEXT        NOT NULL,
    why_it_matters          TEXT        NOT NULL,
    recommended_next_action TEXT        NOT NULL,
    agent_handoff_prompt    TEXT        NOT NULL DEFAULT '',
    resolved                BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL,
    detected_at             TIMESTAMPTZ NOT NULL,
    -- Bookkeeping: when this row was last written by a sync. Distinct from the
    -- upstream created_at / detected_at fields.
    stored_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- get_all() orders by priority then detection time; an index on detected_at
-- keeps that ordering cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_work_signals_priority_detected
    ON work_signals (priority, detected_at);

-- Common dashboard filter: unresolved signals only.
CREATE INDEX IF NOT EXISTS idx_work_signals_resolved
    ON work_signals (resolved);
