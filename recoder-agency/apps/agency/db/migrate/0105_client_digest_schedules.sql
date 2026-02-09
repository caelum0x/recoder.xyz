-- P1-004: Weekly Client Auto-Update Digest
CREATE TABLE IF NOT EXISTS public.client_digest_schedules (
  db_id serial PRIMARY KEY,
  id text NOT NULL UNIQUE,
  team_db_id integer NOT NULL REFERENCES public.teams(db_id) ON DELETE CASCADE,
  client_db_id integer NOT NULL REFERENCES public.clients(db_id) ON DELETE CASCADE,
  frequency text NOT NULL DEFAULT 'weekly',
  last_sent_at timestamp,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (team_db_id, client_db_id)
);

CREATE INDEX IF NOT EXISTS client_digest_schedules_team_db_id_idx
  ON public.client_digest_schedules(team_db_id);
CREATE INDEX IF NOT EXISTS client_digest_schedules_is_active_idx
  ON public.client_digest_schedules(is_active);
