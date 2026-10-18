-- Phase 0: replace the public fallback cron credential with a Vault-only secret
-- and use POST for the state-changing publication endpoint.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET'
      AND decrypted_secret IS NOT NULL
      AND length(decrypted_secret) >= 32
  ) THEN
    RAISE EXCEPTION 'CRON_SECRET ausente ou fraco no Supabase Vault. Cadastre um segredo aleatorio com pelo menos 32 caracteres antes de aplicar esta migration.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-blogger-posts') THEN
    PERFORM cron.unschedule('publish-scheduled-blogger-posts');
  END IF;
END $$;

SELECT cron.schedule(
  'publish-scheduled-blogger-posts',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://blogger-bice-three.vercel.app/api/cron/publish-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'CRON_SECRET'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
