-- Fix: approving an article "for a later date" (status ready) published it at once.
-- The publication trigger queued publish_content for "ready" too, using the old
-- calendar date (already in the past). Only "scheduled" may queue publication now.

CREATE OR REPLACE FUNCTION private.enqueue_content_publication_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target_organization_id uuid;
  target_scheduled_at timestamptz;
BEGIN
  IF NEW.status IS DISTINCT FROM 'scheduled' THEN
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
$function$;
