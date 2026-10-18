-- Retire the legacy job that invoked a Vercel route with a public fallback
-- credential. Its Supabase-only replacement is installed separately.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-blogger-posts') THEN
    PERFORM cron.unschedule('publish-scheduled-blogger-posts');
  END IF;
END $$;
