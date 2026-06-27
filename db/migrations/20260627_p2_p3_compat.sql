ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS refresh_token_version integer NOT NULL DEFAULT 0;

ALTER TABLE public.watchlist
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_notified_status text;
