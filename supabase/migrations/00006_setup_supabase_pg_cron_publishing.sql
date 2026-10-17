-- ==============================================================================
-- Migration 00006: Configuração do Agendador Nativo no Supabase (pg_cron + pg_net)
-- Responsável por disparar a verificação de artigos agendados a cada 5 minutos
-- diretamente a partir da infraestrutura do PostgreSQL no Supabase.
-- ==============================================================================

-- 1. Habilitar extensões necessárias para cron e requisições HTTP dentro do Postgres
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Remove agendamentos antigos com o mesmo nome para garantir idempotência
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-blogger-posts') THEN
    PERFORM cron.unschedule('publish-scheduled-blogger-posts');
  END IF;
END $$;

-- 3. Agendar a verificação de publicação para rodar a cada 5 minutos (*/5 * * * *)
-- Realiza chamada HTTP GET autenticada via pg_net para o endpoint de publicação
SELECT cron.schedule(
  'publish-scheduled-blogger-posts',
  '*/5 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://blogger-bice-three.vercel.app/api/cron/publish-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        current_setting('app.settings.cron_secret', true),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
        'blogger-secret-cron-token-2026'
      )
    )
  );
  $$
);
