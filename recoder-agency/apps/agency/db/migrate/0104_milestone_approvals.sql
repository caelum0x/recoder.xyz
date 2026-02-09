-- P1-003: Client Milestone-Level Approve/Reject
ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS phase_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS milestone_approval_status text NOT NULL DEFAULT 'not_applicable';

CREATE TABLE IF NOT EXISTS public.milestone_approvals (
  db_id serial PRIMARY KEY,
  id text NOT NULL UNIQUE,
  project_db_id integer NOT NULL REFERENCES public.projects(db_id) ON DELETE CASCADE,
  milestone_label text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  decided_by_user_db_id integer REFERENCES public.users(db_id) ON DELETE SET NULL,
  decision_reason text,
  decided_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (project_db_id, milestone_label)
);

CREATE INDEX IF NOT EXISTS milestone_approvals_project_db_id_idx
  ON public.milestone_approvals(project_db_id);
