
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.domains (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domains TO anon, authenticated;
GRANT ALL ON public.domains TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.domains_id_seq TO anon, authenticated, service_role;
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all domains" ON public.domains FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_domains_status ON public.domains(status);
CREATE INDEX idx_domains_tld ON public.domains(tld);
CREATE INDEX idx_domains_score ON public.domains(score DESC);
CREATE INDEX idx_domains_length ON public.domains(length);
CREATE INDEX idx_domains_drop_date ON public.domains(drop_date);
CREATE INDEX idx_domains_risk ON public.domains(risk_level);
CREATE INDEX idx_domains_type ON public.domains(type);
CREATE INDEX idx_domains_name_trgm ON public.domains USING gin (name gin_trgm_ops);

CREATE TABLE public.domain_metrics (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_metrics TO anon, authenticated;
GRANT ALL ON public.domain_metrics TO service_role;
ALTER TABLE public.domain_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all domain_metrics" ON public.domain_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_metrics_backlinks ON public.domain_metrics(backlinks DESC);
CREATE INDEX idx_metrics_archive_year ON public.domain_metrics(archive_year);

CREATE TABLE public.domain_whois (
  domain_id bigint PRIMARY KEY REFERENCES public.domains(id) ON DELETE CASCADE,
  registrar text,
  created_date timestamptz,
  expiry_date timestamptz,
  updated_date timestamptz,
  nameservers text[],
  raw_data jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_whois TO anon, authenticated;
GRANT ALL ON public.domain_whois TO service_role;
ALTER TABLE public.domain_whois ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all domain_whois" ON public.domain_whois FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.domain_dns (
  domain_id bigint PRIMARY KEY REFERENCES public.domains(id) ON DELETE CASCADE,
  a_records text[],
  ns_records text[],
  mx_records text[],
  txt_records text[],
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_dns TO anon, authenticated;
GRANT ALL ON public.domain_dns TO service_role;
ALTER TABLE public.domain_dns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all domain_dns" ON public.domain_dns FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.watchlist (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO anon, authenticated;
GRANT ALL ON public.watchlist TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.watchlist_id_seq TO anon, authenticated, service_role;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all watchlist" ON public.watchlist FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_watchlist_status ON public.watchlist(status);

CREATE TABLE public.my_domains (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.my_domains TO anon, authenticated;
GRANT ALL ON public.my_domains TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.my_domains_id_seq TO anon, authenticated, service_role;
ALTER TABLE public.my_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all my_domains" ON public.my_domains FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.registrars (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  api_key_encrypted text,
  api_secret_encrypted text,
  enabled boolean NOT NULL DEFAULT false,
  buy_url_template text,
  config_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrars TO anon, authenticated;
GRANT ALL ON public.registrars TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.registrars_id_seq TO anon, authenticated, service_role;
ALTER TABLE public.registrars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all registrars" ON public.registrars FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.data_sources (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_sources TO anon, authenticated;
GRANT ALL ON public.data_sources TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.data_sources_id_seq TO anon, authenticated, service_role;
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all data_sources" ON public.data_sources FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.scoring_rules (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  weights jsonb NOT NULL DEFAULT '{"length":20,"semantic":20,"tld":15,"archive":15,"backlinks":15,"related_tld":10,"brandable":5,"risk_penalty_max":20}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scoring_rules TO anon, authenticated;
GRANT ALL ON public.scoring_rules TO service_role;
ALTER TABLE public.scoring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all scoring_rules" ON public.scoring_rules FOR ALL USING (true) WITH CHECK (true);
INSERT INTO public.scoring_rules (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.auctions (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auctions TO anon, authenticated;
GRANT ALL ON public.auctions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.auctions_id_seq TO anon, authenticated, service_role;
ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all auctions" ON public.auctions FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_auctions_end_time ON public.auctions(end_time);
CREATE INDEX idx_auctions_platform ON public.auctions(platform);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_domains_touch BEFORE UPDATE ON public.domains FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_watchlist_touch BEFORE UPDATE ON public.watchlist FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_my_domains_touch BEFORE UPDATE ON public.my_domains FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_registrars_touch BEFORE UPDATE ON public.registrars FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_data_sources_touch BEFORE UPDATE ON public.data_sources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_auctions_touch BEFORE UPDATE ON public.auctions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
