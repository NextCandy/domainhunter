-- DomainHunter — self-hosted Postgres schema (Synology / Docker)
-- This file is executed automatically by the postgres:16-alpine image on first boot
-- via /docker-entrypoint-initdb.d.
--
-- Differences vs the Lovable Cloud (Supabase) migrations:
--   * No `auth` schema. Users live in public.app_users.
--   * No RLS (the app connects with a single role and enforces authorization in code).
--   * Sequences / grants stripped to a single application role (POSTGRES_USER).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
--  USERS & ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE,
  password_hash text,
  display_name  text,
  google_sub    text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- First user automatically becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user_admin()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_app_user_created_admin ON public.app_users;
CREATE TRIGGER on_app_user_created_admin
AFTER INSERT ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_admin();

-- Touch updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END
$$ LANGUAGE plpgsql;

-- ============================================================
--  RDAP JOBS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
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
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON public.jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.job_items (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  tld TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  info JSONB,
  error TEXT,
  checked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS job_items_job_status_idx ON public.job_items (job_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS job_items_unique ON public.job_items (job_id, domain);

CREATE TABLE IF NOT EXISTS public.tlds_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_events (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL,
  level text NOT NULL DEFAULT 'info',
  event text NOT NULL,
  message text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_events_job_id_created_at_idx ON public.job_events (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_events_level_idx ON public.job_events (level);

-- ============================================================
--  DOMAINS, METRICS, DNS, WHOIS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.domains (
  id bigserial PRIMARY KEY,
  domain text NOT NULL UNIQUE,
  name text NOT NULL,
  tld text NOT NULL,
  length integer NOT NULL,
  type text NOT NULL DEFAULT 'mixed',
  status text NOT NULL DEFAULT 'unknown',
  score integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'unknown',
  source text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  drop_date timestamptz,
  expiry_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_domains_status ON public.domains(status);
CREATE INDEX IF NOT EXISTS idx_domains_tld ON public.domains(tld);
CREATE INDEX IF NOT EXISTS idx_domains_score ON public.domains(score DESC);
CREATE INDEX IF NOT EXISTS idx_domains_length ON public.domains(length);
CREATE INDEX IF NOT EXISTS idx_domains_drop_date ON public.domains(drop_date);
CREATE INDEX IF NOT EXISTS idx_domains_risk ON public.domains(risk_level);
CREATE INDEX IF NOT EXISTS idx_domains_type ON public.domains(type);
CREATE INDEX IF NOT EXISTS idx_domains_name_trgm ON public.domains USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.domain_metrics (
  domain_id bigint PRIMARY KEY REFERENCES public.domains(id) ON DELETE CASCADE,
  backlinks integer NOT NULL DEFAULT 0,
  referring_domains integer NOT NULL DEFAULT 0,
  archive_year integer,
  archive_count integer NOT NULL DEFAULT 0,
  tld_registered_count integer NOT NULL DEFAULT 0,
  related_domain_count integer NOT NULL DEFAULT 0,
  seo_score integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_metrics_backlinks ON public.domain_metrics(backlinks DESC);

CREATE TABLE IF NOT EXISTS public.domain_whois (
  domain_id bigint PRIMARY KEY REFERENCES public.domains(id) ON DELETE CASCADE,
  registrar text,
  created_date timestamptz,
  expiry_date timestamptz,
  updated_date timestamptz,
  nameservers text[],
  raw_data jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.domain_dns (
  domain_id bigint PRIMARY KEY REFERENCES public.domains(id) ON DELETE CASCADE,
  a_records text[],
  ns_records text[],
  mx_records text[],
  txt_records text[],
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.watchlist (
  id bigserial PRIMARY KEY,
  domain_id bigint NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'watching',
  tags text[] NOT NULL DEFAULT '{}',
  note text,
  notify_before_drop boolean NOT NULL DEFAULT true,
  notify_on_available boolean NOT NULL DEFAULT true,
  notify_on_price_change boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(domain_id)
);

CREATE TABLE IF NOT EXISTS public.my_domains (
  id bigserial PRIMARY KEY,
  domain text NOT NULL UNIQUE,
  registrar text,
  expiry_date timestamptz,
  dns_status text,
  renew_reminder boolean NOT NULL DEFAULT true,
  note text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.registrars (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  slug text UNIQUE,
  website text,
  api_key_encrypted text,
  api_secret_encrypted text,
  api_enabled boolean NOT NULL DEFAULT false,
  api_base_url text,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  buy_url_template text,
  config_json jsonb NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.registrar_prices (
  id bigserial PRIMARY KEY,
  registrar_id bigint NOT NULL REFERENCES public.registrars(id) ON DELETE CASCADE,
  tld text NOT NULL,
  register_price numeric(10,2),
  renew_price numeric(10,2),
  transfer_price numeric(10,2),
  currency text NOT NULL DEFAULT 'USD',
  privacy_free boolean NOT NULL DEFAULT false,
  api_supported boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(registrar_id, tld)
);
CREATE INDEX IF NOT EXISTS idx_registrar_prices_tld ON public.registrar_prices(tld);

CREATE TABLE IF NOT EXISTS public.coupons (
  id bigserial PRIMARY KEY,
  registrar_id bigint REFERENCES public.registrars(id) ON DELETE SET NULL,
  code text NOT NULL,
  title text,
  description text,
  tlds text[] NOT NULL DEFAULT '{}',
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value numeric(10,2),
  valid_from timestamptz,
  valid_until timestamptz,
  source_url text,
  verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coupons_status ON public.coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_valid_until ON public.coupons(valid_until);

CREATE TABLE IF NOT EXISTS public.domain_ideas (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  keywords text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  results jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_domain_ideas_user ON public.domain_ideas(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.data_sources (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'manual',
  url text,
  enabled boolean NOT NULL DEFAULT true,
  sync_interval_min integer NOT NULL DEFAULT 1440,
  last_sync_at timestamptz,
  last_sync_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scoring_rules (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  weights jsonb NOT NULL DEFAULT '{"length":20,"semantic":20,"tld":15,"archive":15,"backlinks":15,"related_tld":10,"brandable":5,"risk_penalty_max":20}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.scoring_rules (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.auctions (
  id bigserial PRIMARY KEY,
  domain text NOT NULL,
  platform text NOT NULL,
  current_price numeric(12,2),
  currency text DEFAULT 'USD',
  end_time timestamptz,
  bid_count integer DEFAULT 0,
  buy_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(domain, platform)
);
CREATE INDEX IF NOT EXISTS idx_auctions_end_time ON public.auctions(end_time);
CREATE INDEX IF NOT EXISTS idx_auctions_platform ON public.auctions(platform);

-- ============================================================
--  ENRICH SYSTEM
-- ============================================================
CREATE TABLE IF NOT EXISTS public.enrich_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  name text NOT NULL,
  kinds text[] NOT NULL DEFAULT ARRAY['dns','archive']::text[],
  scope text NOT NULL DEFAULT 'available',
  status text NOT NULL DEFAULT 'pending',
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

CREATE TABLE IF NOT EXISTS public.enrich_items (
  id bigserial PRIMARY KEY,
  enrich_job_id uuid NOT NULL REFERENCES public.enrich_jobs(id) ON DELETE CASCADE,
  domain text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  error text,
  attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enrich_items_job_status ON public.enrich_items(enrich_job_id, status);
CREATE INDEX IF NOT EXISTS enrich_items_domain ON public.enrich_items(domain);

CREATE TABLE IF NOT EXISTS public.enrich_cache (
  domain text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  ttl_seconds int NOT NULL DEFAULT 86400,
  PRIMARY KEY (domain, kind)
);

-- ============================================================
--  TRIGGERS
-- ============================================================
DO $$ BEGIN
  CREATE TRIGGER trg_domains_touch BEFORE UPDATE ON public.domains FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_watchlist_touch BEFORE UPDATE ON public.watchlist FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_my_domains_touch BEFORE UPDATE ON public.my_domains FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_registrars_touch BEFORE UPDATE ON public.registrars FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_data_sources_touch BEFORE UPDATE ON public.data_sources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_auctions_touch BEFORE UPDATE ON public.auctions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_registrar_prices_touch BEFORE UPDATE ON public.registrar_prices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_coupons_touch BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
--  SEED REGISTRARS
-- ============================================================
INSERT INTO public.registrars (name, slug, website, enabled, status, buy_url_template)
VALUES
  ('Spaceship', 'spaceship', 'https://www.spaceship.com', true, 'active', 'https://www.spaceship.com/domains/search/?query={domain}'),
  ('Namecheap', 'namecheap', 'https://www.namecheap.com', true, 'active', 'https://www.namecheap.com/domains/registration/results/?domain={domain}'),
  ('Porkbun', 'porkbun', 'https://porkbun.com', true, 'active', 'https://porkbun.com/checkout/search?q={domain}'),
  ('Dynadot', 'dynadot', 'https://www.dynadot.com', true, 'active', 'https://www.dynadot.com/domain/search?domain={domain}'),
  ('NameSilo', 'namesilo', 'https://www.namesilo.com', true, 'active', 'https://www.namesilo.com/domain/search-domains?query={domain}'),
  ('Cloudflare Registrar', 'cloudflare', 'https://www.cloudflare.com/products/registrar/', true, 'active', 'https://dash.cloudflare.com/?to=/:account/domains/register/{domain}'),
  ('GoDaddy', 'godaddy', 'https://www.godaddy.com', true, 'active', 'https://www.godaddy.com/domainsearch/find?domainToCheck={domain}')
ON CONFLICT (name) DO NOTHING;
