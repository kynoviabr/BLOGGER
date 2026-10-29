-- Fila sem espera fixa: quando o worker termina um job e ainda há trabalho
-- pronto, ele se chama de novo na hora (via pg_net, sem prender a requisição).
-- O pg_cron de 1 minuto continua só como rede de segurança.

CREATE OR REPLACE FUNCTION public.kick_job_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1)
      || '/functions/v1/process-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'secret_key' LIMIT 1),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'PUBLISH_CRON_SECRET' LIMIT 1)
    ),
    body := '{"chain": true}'::jsonb,
    timeout_milliseconds := 150000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kick_job_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kick_job_worker() TO service_role;
