-- P1-005: Capacity + WIP Limit Board
CREATE TABLE IF NOT EXISTS public.team_capacity_settings (
  db_id serial PRIMARY KEY,
  team_db_id integer NOT NULL UNIQUE REFERENCES public.teams(db_id) ON DELETE CASCADE,
  max_concurrent_projects integer NOT NULL DEFAULT 10,
  max_concurrent_per_member integer NOT NULL DEFAULT 3,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS assigned_user_db_id integer REFERENCES public.users(db_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_assigned_user_db_id_idx
  ON public.projects(assigned_user_db_id);
