
-- jobs table
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|running|paused|completed|stopped
  total INT NOT NULL DEFAULT 0,
  checked INT NOT NULL DEFAULT 0,
  available INT NOT NULL DEFAULT 0,
  registered INT NOT NULL DEFAULT 0,
  unsupported INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_progress_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO anon, authenticated;
GRANT ALL ON public.jobs TO service_role;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read jobs" ON public.jobs FOR SELECT USING (true);
CREATE POLICY "public insert jobs" ON public.jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "public update jobs" ON public.jobs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete jobs" ON public.jobs FOR DELETE USING (true);

CREATE INDEX jobs_created_at_idx ON public.jobs (created_at DESC);

-- job_items table
CREATE TABLE public.job_items (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  tld TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|available|registered|unsupported|error|reserved
  info JSONB,
  error TEXT,
  checked_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_items TO anon, authenticated;
GRANT ALL ON public.job_items TO service_role;

ALTER TABLE public.job_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all job_items" ON public.job_items FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX job_items_job_status_idx ON public.job_items (job_id, status);
CREATE INDEX job_items_job_idx ON public.job_items (job_id);
CREATE UNIQUE INDEX job_items_unique ON public.job_items (job_id, domain);

-- tlds cache
CREATE TABLE public.tlds_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tlds_cache TO anon, authenticated;
GRANT ALL ON public.tlds_cache TO service_role;

ALTER TABLE public.tlds_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all tlds_cache" ON public.tlds_cache FOR ALL USING (true) WITH CHECK (true);
