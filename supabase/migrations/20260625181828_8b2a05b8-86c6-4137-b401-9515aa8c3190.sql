
-- 1) Extend registrars
ALTER TABLE public.registrars
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS api_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_base_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS notes text;

UPDATE public.registrars SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS registrars_slug_key ON public.registrars(slug) WHERE slug IS NOT NULL;

-- Allow authenticated read of basic registrar info (no key fields exposed via policies; client should select safe cols)
DROP POLICY IF EXISTS "authenticated read registrars" ON public.registrars;
CREATE POLICY "authenticated read registrars" ON public.registrars
  FOR SELECT TO authenticated USING (true);

-- 2) registrar_prices
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
GRANT SELECT ON public.registrar_prices TO authenticated;
GRANT ALL ON public.registrar_prices TO service_role;
ALTER TABLE public.registrar_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read prices" ON public.registrar_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write prices" ON public.registrar_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_registrar_prices_touch BEFORE UPDATE ON public.registrar_prices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_registrar_prices_tld ON public.registrar_prices(tld);

-- 3) coupons
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
GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read coupons" ON public.coupons FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write coupons" ON public.coupons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_coupons_touch BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_coupons_status ON public.coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_valid_until ON public.coupons(valid_until);

-- 4) domain_ideas
CREATE TABLE IF NOT EXISTS public.domain_ideas (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keywords text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  results jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_ideas TO authenticated;
GRANT ALL ON public.domain_ideas TO service_role;
ALTER TABLE public.domain_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ideas" ON public.domain_ideas FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_domain_ideas_user ON public.domain_ideas(user_id, created_at DESC);

-- 5) Seed common registrars (idempotent by slug)
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
