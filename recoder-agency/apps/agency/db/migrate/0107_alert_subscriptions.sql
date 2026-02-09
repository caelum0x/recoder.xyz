-- P1-006: Alerting Integrations (Slack/Email)
CREATE TABLE IF NOT EXISTS public.alert_subscriptions (
  db_id serial PRIMARY KEY,
  id text NOT NULL UNIQUE,
  team_db_id integer NOT NULL REFERENCES public.teams(db_id) ON DELETE CASCADE,
  channel text NOT NULL,
  event_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_subscriptions_team_db_id_idx
  ON public.alert_subscriptions(team_db_id);
CREATE INDEX IF NOT EXISTS alert_subscriptions_event_type_idx
  ON public.alert_subscriptions(event_type);
CREATE INDEX IF NOT EXISTS alert_subscriptions_is_active_idx
  ON public.alert_subscriptions(is_active);
