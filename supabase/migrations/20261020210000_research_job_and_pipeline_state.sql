-- 4F: Research as first-class job + pipeline state machine

-- Extend background_jobs job_type to include 'research'
ALTER TABLE public.background_jobs DROP CONSTRAINT IF EXISTS background_jobs_job_type_check;
ALTER TABLE public.background_jobs ADD CONSTRAINT background_jobs_job_type_check
  CHECK (job_type IN ('research','content_pipeline','image_generation','publish_content','autopilot_tick'));

-- Retry: also allow research_publish_failed / researching states later via content_items
-- Add research_status tracking to content_items (non-breaking, nullable)
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS research_status text
  CHECK (research_status IS NULL OR research_status IN ('pending','researching','ready','review_required','failed'));
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS researched_at timestamptz;
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS briefing_text text;

-- Extend ContentStatus enum in DB check to allow researching/publish_failed if not present
DO $$
BEGIN
  -- content_items.status check already allows many values; extend if needed
  BEGIN
    ALTER TABLE public.content_items DROP CONSTRAINT content_items_status_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  ALTER TABLE public.content_items ADD CONSTRAINT content_items_status_check
    CHECK (status IN ('draft','researching','reviewing','ready','scheduled','publishing','publish_failed','published','archived'));
END $$;

-- Recreate enqueue with research in allowlist + quota exempt
CREATE OR REPLACE FUNCTION public.enqueue_background_job(
  p_job_type text, p_payload jsonb DEFAULT '{}'::jsonb, p_organization_id uuid DEFAULT NULL, p_blog_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL, p_scheduled_at timestamptz DEFAULT now(), p_priority smallint DEFAULT 100, p_max_attempts smallint DEFAULT 5
)
RETURNS public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE actor_id uuid := (SELECT auth.uid()); resolved_organization_id uuid; inserted_job public.background_jobs;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_job_type NOT IN ('research','content_pipeline','image_generation','publish_content','autopilot_tick') THEN RAISE EXCEPTION 'Unsupported job type: %', p_job_type USING ERRCODE='22023'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Job payload must be a JSON object' USING ERRCODE='22023'; END IF;
  IF p_blog_id IS NOT NULL THEN
    SELECT blog.organization_id INTO resolved_organization_id FROM public.blogs blog WHERE blog.id = p_blog_id;
    IF resolved_organization_id IS NULL THEN RAISE EXCEPTION 'Blog not found' USING ERRCODE='P0002'; END IF;
    IF p_organization_id IS NOT NULL AND p_organization_id <> resolved_organization_id THEN RAISE EXCEPTION 'Blog does not belong to the requested organization' USING ERRCODE='42501'; END IF;
  ELSE resolved_organization_id := COALESCE(p_organization_id, (SELECT private.current_organization_id())); END IF;
  IF resolved_organization_id IS NULL OR NOT private.has_organization_role(resolved_organization_id, ARRAY['owner','admin','editor']) THEN RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE='42501'; END IF;
  IF p_job_type='autopilot_tick' AND NOT private.has_organization_role(resolved_organization_id, ARRAY['owner','admin']) THEN RAISE EXCEPTION 'Autopilot jobs require owner or admin role' USING ERRCODE='42501'; END IF;
  IF p_job_type IN ('content_pipeline','image_generation') THEN PERFORM public.check_organization_quota(resolved_organization_id, p_job_type); END IF;
  INSERT INTO public.background_jobs (organization_id, blog_id, job_type, payload, priority, max_attempts, idempotency_key, scheduled_at, created_by)
  VALUES (resolved_organization_id, p_blog_id, p_job_type, p_payload, p_priority, p_max_attempts, NULLIF(trim(p_idempotency_key),''), GREATEST(COALESCE(p_scheduled_at, now()), now() - interval '1 minute'), actor_id)
  ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key RETURNING * INTO inserted_job;
  RETURN inserted_job;
END;
$$;

COMMENT ON COLUMN public.content_items.research_status IS '4F: research gate status (fail-closed for YMYL High without official source -> review_required)';
