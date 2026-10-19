-- Activate only after the Edge Function and its secrets have been validated.
DO $$
DECLARE
  missing_names text[];
BEGIN
  SELECT array_agg(required.name ORDER BY required.name) INTO missing_names
  FROM (VALUES ('project_url'), ('secret_key'), ('PUBLISH_CRON_SECRET')) AS required(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets secret
    WHERE secret.name = required.name
      AND secret.decrypted_secret IS NOT NULL
      AND length(secret.decrypted_secret) > 0
  );
  IF missing_names IS NOT NULL THEN
    RAISE EXCEPTION 'Segredos ausentes no Vault: %', array_to_string(missing_names, ', ');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-blogger-posts') THEN
    PERFORM cron.unschedule('publish-scheduled-blogger-posts');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'supabase-edge-publish-content') THEN
    PERFORM cron.unschedule('supabase-edge-publish-content');
  END IF;
END $$;

SELECT cron.schedule(
  'supabase-edge-publish-content',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1)
      || '/functions/v1/publish-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'secret_key' LIMIT 1),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'PUBLISH_CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $job$
);
