
-- ============== USER ROLES ==============
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- First signup -> auto admin
CREATE OR REPLACE FUNCTION public.handle_new_user_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_admin();

-- ============== TIGHTEN EXISTING RLS (admin-only) ==============
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN (
      'jobs','job_items','job_events','tlds_cache','domains','domain_metrics',
      'domain_dns','domain_whois','watchlist','my_domains','registrars',
      'data_sources','scoring_rules','app_settings','auctions'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Revoke anon on these tables, grant only authenticated (admin-checked via policy)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['jobs','job_items','job_events','tlds_cache','domains','domain_metrics','domain_dns','domain_whois','watchlist','my_domains','registrars','data_sources','scoring_rules','app_settings','auctions']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY "admin all access" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;

-- ============== ENRICH SYSTEM ==============
CREATE TABLE public.enrich_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  name text NOT NULL,
  kinds text[] NOT NULL DEFAULT ARRAY['dns','archive']::text[],
  scope text NOT NULL DEFAULT 'available', -- available | registered | all
  status text NOT NULL DEFAULT 'pending',  -- pending | running | completed | stopped | error
  total int NOT NULL DEFAULT 0,
  done int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  cached_hits int NOT NULL DEFAULT 0,
  concurrency int NOT NULL DEFAULT 5,
  qps int NOT NULL DEFAULT 5,
  cache_ttl_seconds int NOT NULL DEFAULT 86400,
  started_at timestamptz,
  finished_at timestamptz,
  last_progress_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrich_jobs TO authenticated;
GRANT ALL ON public.enrich_jobs TO service_role;
ALTER TABLE public.enrich_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all" ON public.enrich_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.enrich_items (
  id bigserial PRIMARY KEY,
  enrich_job_id uuid NOT NULL REFERENCES public.enrich_jobs(id) ON DELETE CASCADE,
  domain text NOT NULL,
  kind text NOT NULL, -- dns | archive | seo
  status text NOT NULL DEFAULT 'pending', -- pending | running | done | error | cached | skipped
  result jsonb,
  error text,
  attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enrich_items_job_status ON public.enrich_items(enrich_job_id, status);
CREATE INDEX enrich_items_domain ON public.enrich_items(domain);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrich_items TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.enrich_items_id_seq TO authenticated;
GRANT ALL ON public.enrich_items TO service_role;
GRANT ALL ON SEQUENCE public.enrich_items_id_seq TO service_role;
ALTER TABLE public.enrich_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all" ON public.enrich_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.enrich_cache (
  domain text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  ttl_seconds int NOT NULL DEFAULT 86400,
  PRIMARY KEY (domain, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrich_cache TO authenticated;
GRANT ALL ON public.enrich_cache TO service_role;
ALTER TABLE public.enrich_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all" ON public.enrich_cache FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
