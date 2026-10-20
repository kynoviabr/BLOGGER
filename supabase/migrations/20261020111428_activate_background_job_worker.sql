-- Phase 4C: enqueue publication jobs and schedule the Supabase Edge worker.
-- Vercel is deliberately absent from this execution path.

CREATE OR REPLACE FUNCTION private.enqueue_content_publication_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_organization_id uuid;
  target_scheduled_at timestamptz;
BEGIN
  IF NEW.status NOT IN ('ready', 'scheduled') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT blog.organization_id INTO target_organization_id
  FROM public.blogs blog
  WHERE blog.id = NEW.blog_id AND blog.status = 'active';
  IF target_organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT calendar.scheduled_at INTO target_scheduled_at
  FROM public.editorial_calendar calendar
  WHERE calendar.id = NEW.editorial_calendar_id;

  INSERT INTO public.background_jobs (
    organization_id,
    blog_id,
    job_type,
    payload,
    priority,
    max_attempts,
    idempotency_key,
    scheduled_at
  ) VALUES (
    target_organization_id,
    NEW.blog_id,
    'publish_content',
    jsonb_build_object('contentId', NEW.id),
    100,
    5,
    'publish:' || NEW.id::text || ':' || NEW.publish_attempts::text,
    GREATEST(now(), COALESCE(target_scheduled_at, now()))
  )
  ON CONFLICT (organization_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_content_publication_job() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enqueue_content_publication_job ON public.content_items;
CREATE TRIGGER enqueue_content_publication_job
  AFTER INSERT OR UPDATE OF status ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION private.enqueue_content_publication_job();

-- Backfill only currently eligible items. Terminal publish_failed records stay
-- untouched and require an explicit human decision.
INSERT INTO public.background_jobs (
  organization_id,
  blog_id,
  job_type,
  payload,
  priority,
  max_attempts,
  idempotency_key,
  scheduled_at
)
SELECT
  blog.organization_id,
  content.blog_id,
  'publish_content',
  jsonb_build_object('contentId', content.id),
  100,
  5,
  'publish:' || content.id::text || ':' || content.publish_attempts::text,
  GREATEST(now(), COALESCE(calendar.scheduled_at, now()))
FROM public.content_items content
JOIN public.blogs blog ON blog.id = content.blog_id AND blog.status = 'active'
LEFT JOIN public.editorial_calendar calendar ON calendar.id = content.editorial_calendar_id
WHERE content.status IN ('ready', 'scheduled')
  AND content.publish_attempts < 5
ON CONFLICT (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL
DO NOTHING;

DO $$
DECLARE
  missing_names text[];
BEGIN
  SELECT array_agg(required.name ORDER BY required.name) INTO missing_names
  FROM (VALUES ('project_url'), ('secret_key'), ('PUBLISH_CRON_SECRET')) AS required(name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets secret
    WHERE secret.name = required.name
      AND secret.decrypted_secret IS NOT NULL
      AND length(secret.decrypted_secret) > 0
  );
  IF missing_names IS NOT NULL THEN
    RAISE EXCEPTION 'Segredos ausentes no Vault: %', array_to_string(missing_names, ', ');
  END IF;
END $$;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'publish-scheduled-blogger-posts',
      'supabase-edge-publish-content',
      'supabase-process-background-jobs'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'supabase-process-background-jobs',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1)
      || '/functions/v1/process-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'secret_key' LIMIT 1),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'PUBLISH_CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);
