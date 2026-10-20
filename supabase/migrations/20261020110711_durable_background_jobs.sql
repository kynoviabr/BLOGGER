-- Phase 4A: durable, tenant-aware job ledger and atomic worker primitives.
-- Scheduling and execution remain entirely inside Supabase. This migration does
-- not activate a cron job; workers are enabled only after the queue is verified.

-- The composite key lets Postgres enforce that a job's blog belongs to the
-- same organization even when privileged server code inserts directly.
CREATE UNIQUE INDEX IF NOT EXISTS uq_blogs_id_organization
  ON public.blogs (id, organization_id);

CREATE TABLE public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  blog_id uuid,
  job_type text NOT NULL CHECK (job_type IN (
    'content_pipeline', 'image_generation', 'publish_content', 'autopilot_tick'
  )),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'retrying', 'completed', 'dead_letter', 'cancelled'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  result jsonb,
  priority smallint NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts smallint NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  idempotency_key text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT background_jobs_blog_tenant_fkey
    FOREIGN KEY (blog_id, organization_id)
    REFERENCES public.blogs(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT background_jobs_idempotency_key_length
    CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 1 AND 200),
  CONSTRAINT background_jobs_claim_consistency CHECK (
    (status = 'running' AND claimed_at IS NOT NULL AND claimed_by IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (status <> 'running' AND claimed_at IS NULL AND claimed_by IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE UNIQUE INDEX uq_background_jobs_idempotency
  ON public.background_jobs (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_background_jobs_claimable
  ON public.background_jobs (priority, scheduled_at, created_at)
  WHERE status IN ('queued', 'retrying');

CREATE INDEX idx_background_jobs_tenant_status
  ON public.background_jobs (organization_id, status, created_at DESC);

CREATE INDEX idx_background_jobs_blog_created
  ON public.background_jobs (blog_id, created_at DESC)
  WHERE blog_id IS NOT NULL;

CREATE TABLE public.background_job_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.background_jobs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  attempt smallint NOT NULL,
  worker_id text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_background_job_events_job_created
  ON public.background_job_events (job_id, created_at DESC);
CREATE INDEX idx_background_job_events_tenant_created
  ON public.background_job_events (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.audit_background_job_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.background_job_events (
      job_id, organization_id, from_status, to_status, attempt, worker_id, message
    ) VALUES (
      NEW.id,
      NEW.organization_id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      NEW.status,
      NEW.attempts,
      NEW.claimed_by,
      CASE
        WHEN NEW.status = 'dead_letter' THEN NEW.last_error
        WHEN NEW.status = 'retrying' THEN NEW.last_error
        ELSE NULL
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_background_job_transition
  AFTER INSERT OR UPDATE OF status ON public.background_jobs
  FOR EACH ROW EXECUTE FUNCTION private.audit_background_job_transition();

CREATE TRIGGER update_background_jobs_updated_at
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enqueue_background_job(
  p_job_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_organization_id uuid DEFAULT NULL,
  p_blog_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT now(),
  p_priority smallint DEFAULT 100,
  p_max_attempts smallint DEFAULT 5
)
RETURNS public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  resolved_organization_id uuid;
  inserted_job public.background_jobs;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_job_type NOT IN ('content_pipeline', 'image_generation', 'publish_content', 'autopilot_tick') THEN
    RAISE EXCEPTION 'Unsupported job type: %', p_job_type USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Job payload must be a JSON object' USING ERRCODE = '22023';
  END IF;

  IF p_blog_id IS NOT NULL THEN
    SELECT blog.organization_id INTO resolved_organization_id
    FROM public.blogs blog
    WHERE blog.id = p_blog_id;
    IF resolved_organization_id IS NULL THEN
      RAISE EXCEPTION 'Blog not found' USING ERRCODE = 'P0002';
    END IF;
    IF p_organization_id IS NOT NULL AND p_organization_id <> resolved_organization_id THEN
      RAISE EXCEPTION 'Blog does not belong to the requested organization' USING ERRCODE = '42501';
    END IF;
  ELSE
    resolved_organization_id := COALESCE(p_organization_id, (SELECT private.current_organization_id()));
  END IF;

  IF resolved_organization_id IS NULL OR NOT private.has_organization_role(
    resolved_organization_id,
    ARRAY['owner', 'admin', 'editor']
  ) THEN
    RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE = '42501';
  END IF;
  IF p_job_type = 'autopilot_tick' AND NOT private.has_organization_role(
    resolved_organization_id,
    ARRAY['owner', 'admin']
  ) THEN
    RAISE EXCEPTION 'Autopilot jobs require owner or admin role' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.background_jobs (
    organization_id, blog_id, job_type, payload, priority, max_attempts,
    idempotency_key, scheduled_at, created_by
  ) VALUES (
    resolved_organization_id,
    p_blog_id,
    p_job_type,
    p_payload,
    p_priority,
    p_max_attempts,
    NULLIF(trim(p_idempotency_key), ''),
    GREATEST(COALESCE(p_scheduled_at, now()), now() - interval '1 minute'),
    actor_id
  )
  ON CONFLICT (organization_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING * INTO inserted_job;

  RETURN inserted_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_background_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_worker_id IS NULL OR length(trim(p_worker_id)) < 3 THEN
    RAISE EXCEPTION 'A worker identifier is required' USING ERRCODE = '22023';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds NOT BETWEEN 30 AND 1800 THEN
    RAISE EXCEPTION 'Invalid claim limits' USING ERRCODE = '22023';
  END IF;

  UPDATE public.background_jobs
  SET status = CASE WHEN attempts >= max_attempts THEN 'dead_letter' ELSE 'retrying' END,
      scheduled_at = CASE WHEN attempts >= max_attempts THEN scheduled_at ELSE now() END,
      failed_at = CASE WHEN attempts >= max_attempts THEN now() ELSE failed_at END,
      last_error = COALESCE(last_error, 'Worker lease expired before completion'),
      claimed_at = NULL,
      claimed_by = NULL,
      lease_expires_at = NULL
  WHERE status = 'running'
    AND lease_expires_at < now();

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM public.background_jobs job
    JOIN public.organizations organization ON organization.id = job.organization_id
    LEFT JOIN public.blogs blog ON blog.id = job.blog_id
    WHERE job.status IN ('queued', 'retrying')
      AND job.scheduled_at <= now()
      AND job.attempts < job.max_attempts
      AND organization.status = 'active'
      AND (job.blog_id IS NULL OR blog.status = 'active')
    ORDER BY job.priority, job.scheduled_at, job.created_at
    FOR UPDATE OF job SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.background_jobs job
  SET status = 'running',
      attempts = job.attempts + 1,
      claimed_at = now(),
      claimed_by = trim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  FROM candidates
  WHERE job.id = candidates.id
  RETURNING job.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_background_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer DEFAULT 300
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH refreshed AS (
    UPDATE public.background_jobs
    SET lease_expires_at = now() + make_interval(secs => p_lease_seconds)
    WHERE id = p_job_id
      AND status = 'running'
      AND claimed_by = p_worker_id
      AND p_lease_seconds BETWEEN 30 AND 1800
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM refreshed);
$$;

CREATE OR REPLACE FUNCTION public.complete_background_job(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH completed AS (
    UPDATE public.background_jobs
    SET status = 'completed',
        result = COALESCE(p_result, '{}'::jsonb),
        completed_at = now(),
        last_error = NULL,
        claimed_at = NULL,
        claimed_by = NULL,
        lease_expires_at = NULL
    WHERE id = p_job_id
      AND status = 'running'
      AND claimed_by = p_worker_id
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM completed);
$$;

CREATE OR REPLACE FUNCTION public.fail_background_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_retryable boolean DEFAULT true
)
RETURNS public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_job public.background_jobs;
  failed_job public.background_jobs;
  next_status text;
  retry_delay_seconds integer;
BEGIN
  SELECT * INTO current_job
  FROM public.background_jobs
  WHERE id = p_job_id AND status = 'running' AND claimed_by = p_worker_id
  FOR UPDATE;

  IF current_job.id IS NULL THEN
    RAISE EXCEPTION 'Job is not owned by this worker' USING ERRCODE = '55000';
  END IF;

  next_status := CASE
    WHEN NOT p_retryable OR current_job.attempts >= current_job.max_attempts THEN 'dead_letter'
    ELSE 'retrying'
  END;
  retry_delay_seconds := LEAST(3600, 30 * (2 ^ GREATEST(current_job.attempts - 1, 0))::integer);

  UPDATE public.background_jobs
  SET status = next_status,
      scheduled_at = CASE WHEN next_status = 'retrying'
        THEN now() + make_interval(secs => retry_delay_seconds)
        ELSE scheduled_at
      END,
      failed_at = CASE WHEN next_status = 'dead_letter' THEN now() ELSE NULL END,
      last_error = left(COALESCE(NULLIF(trim(p_error), ''), 'Unknown worker error'), 4000),
      claimed_at = NULL,
      claimed_by = NULL,
      lease_expires_at = NULL
  WHERE id = p_job_id
  RETURNING * INTO failed_job;

  RETURN failed_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_background_job(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_organization_id uuid;
  cancelled_count integer;
BEGIN
  SELECT organization_id INTO target_organization_id
  FROM public.background_jobs
  WHERE id = p_job_id;

  IF target_organization_id IS NULL OR NOT private.has_organization_role(
    target_organization_id,
    ARRAY['owner', 'admin']
  ) THEN
    RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE = '42501';
  END IF;

  UPDATE public.background_jobs
  SET status = 'cancelled',
      claimed_at = NULL,
      claimed_by = NULL,
      lease_expires_at = NULL
  WHERE id = p_job_id AND status IN ('queued', 'retrying');
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN cancelled_count = 1;
END;
$$;

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY background_jobs_select_member ON public.background_jobs
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));

CREATE POLICY background_job_events_select_member ON public.background_job_events
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));

REVOKE ALL ON public.background_jobs, public.background_job_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.background_jobs, public.background_job_events TO authenticated;
GRANT ALL ON public.background_jobs, public.background_job_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.background_job_events_id_seq TO service_role;

REVOKE ALL ON FUNCTION private.audit_background_job_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_background_job(text, jsonb, uuid, uuid, text, timestamptz, smallint, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_background_jobs(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_background_job(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_background_job(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_background_job(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_background_job(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.enqueue_background_job(text, jsonb, uuid, uuid, text, timestamptz, smallint, smallint)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_background_job(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_background_jobs(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_background_job(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_background_job(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_background_job(uuid, text, text, boolean) TO service_role;

COMMENT ON TABLE public.background_jobs IS
  'Durable tenant-aware job ledger. Workers mutate jobs only through service-role RPC functions.';
COMMENT ON TABLE public.background_job_events IS
  'Immutable transition history for background job observability and audits.';
