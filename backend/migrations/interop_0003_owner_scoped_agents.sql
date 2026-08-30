-- interop_0003_owner_scoped_agents.sql
-- Security upgrade: A2A card ids (notably `runtime:codex`) are reusable protocol
-- identities, not globally unique tenant keys. The original schema keyed agents
-- and heartbeats by agent id alone, allowing one tenant's registration/heartbeat
-- to collide with another tenant using the same card id. Backfill the owning user
-- onto every heartbeat and make both relations owner-scoped.

ALTER TABLE interop_heartbeats ADD COLUMN IF NOT EXISTS user_id TEXT;

UPDATE interop_heartbeats AS heartbeat
SET user_id = agent.user_id
FROM interop_agents AS agent
WHERE heartbeat.agent_id = agent.id
  AND heartbeat.user_id IS NULL;

ALTER TABLE interop_heartbeats ALTER COLUMN user_id SET NOT NULL;

DO $$
DECLARE
  definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO definition
  FROM pg_constraint
  WHERE conrelid = 'interop_heartbeats'::regclass
    AND conname = 'interop_heartbeats_agent_id_fkey';

  IF definition IS NOT NULL AND position('user_id' IN definition) = 0 THEN
    ALTER TABLE interop_heartbeats DROP CONSTRAINT interop_heartbeats_agent_id_fkey;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO definition
  FROM pg_constraint
  WHERE conrelid = 'interop_heartbeats'::regclass
    AND contype = 'p';

  IF definition IS NOT NULL AND position('user_id' IN definition) = 0 THEN
    ALTER TABLE interop_heartbeats DROP CONSTRAINT interop_heartbeats_pkey;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO definition
  FROM pg_constraint
  WHERE conrelid = 'interop_agents'::regclass
    AND contype = 'p';

  IF definition IS NOT NULL AND position('user_id' IN definition) = 0 THEN
    ALTER TABLE interop_agents DROP CONSTRAINT interop_agents_pkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'interop_agents'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE interop_agents
      ADD CONSTRAINT interop_agents_pkey PRIMARY KEY (id, user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'interop_heartbeats'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE interop_heartbeats
      ADD CONSTRAINT interop_heartbeats_pkey PRIMARY KEY (agent_id, user_id, seen_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'interop_heartbeats'::regclass
      AND contype = 'f'
      AND position('user_id' IN pg_get_constraintdef(oid)) > 0
  ) THEN
    ALTER TABLE interop_heartbeats
      ADD CONSTRAINT interop_heartbeats_agent_owner_fkey
      FOREIGN KEY (agent_id, user_id)
      REFERENCES interop_agents(id, user_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_interop_hb_owner_agent
  ON interop_heartbeats(user_id, agent_id, seen_at DESC);
