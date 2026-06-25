CREATE TABLE public.job_events (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL,
  level text NOT NULL DEFAULT 'info',
  event text NOT NULL,
  message text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_events TO anon, authenticated;
GRANT ALL ON public.job_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.job_events_id_seq TO anon, authenticated, service_role;

ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all job_events" ON public.job_events
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX job_events_job_id_created_at_idx ON public.job_events (job_id, created_at DESC);
CREATE INDEX job_events_level_idx ON public.job_events (level);