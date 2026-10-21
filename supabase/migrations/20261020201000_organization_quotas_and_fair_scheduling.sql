-- P2: quotas, fair scheduling, and hardened job queue

-- 1) Quotas per organization (articles/images per month; tokens optional)
CREATE TABLE IF NOT EXISTS public.organization_quotas (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  monthly_article_limit integer NOT NULL DEFAULT 100 CHECK (monthly_article_limit BETWEEN 1 AND 100000),
  monthly_image_limit integer NOT NULL DEFAULT 200 CHECK (monthly_image_limit BETWEEN 1 AND 100000),
  monthly_token_limit bigint CHECK (monthly_token_limit IS NULL OR monthly_token_limit >= 0),
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_organization_quotas_updated_at BEFORE UPDATE ON public.organization_quotas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.organization_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_quotas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.organization_quotas TO service_role;
CREATE POLICY organization_quotas_select_member ON public.organization_quotas FOR SELECT TO authenticated USING ((SELECT private.is_organization_member(organization_id)));
GRANT SELECT ON public.organization_quotas TO authenticated;

CREATE OR REPLACE FUNCTION public.get_organization_quota_usage(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org uuid := COALESCE(p_organization_id, (SELECT private.current_organization_id()));
  quota public.organization_quotas;
  articles_this_month bigint;
  images_this_month bigint;
BEGIN
  IF org IS NULL OR NOT private.is_organization_member(org) THEN RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE='42501'; END IF;
  SELECT * INTO quota FROM public.organization_quotas WHERE organization_id = org;
  SELECT count(*) INTO articles_this_month FROM public.background_jobs WHERE organization_id = org AND job_type='content_pipeline' AND created_at >= date_trunc('month', now());
  SELECT count(*) INTO images_this_month FROM public.background_jobs WHERE organization_id = org AND job_type='image_generation' AND created_at >= date_trunc('month', now());
  RETURN jsonb_build_object(
    'organization_id', org,
    'monthly_article_limit', COALESCE(quota.monthly_article_limit, 100),
    'monthly_image_limit', COALESCE(quota.monthly_image_limit, 200),
    'monthly_token_limit', quota.monthly_token_limit,
    'articles_this_month', articles_this_month,
    'images_this_month', images_this_month,
    'enabled', COALESCE(quota.enabled, true)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_organization_quota_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_quota_usage(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_organization_quota(p_organization_id uuid, p_job_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE usage jsonb;
  limit_val bigint; used bigint;
BEGIN
  SELECT public.get_organization_quota_usage(p_organization_id) INTO usage;
  IF (usage->>'enabled')::boolean = false THEN RETURN; END IF;
  IF p_job_type = 'content_pipeline' THEN
    limit_val := (usage->>'monthly_article_limit')::bigint; used := (usage->>'articles_this_month')::bigint;
    IF used >= limit_val THEN RAISE EXCEPTION 'Quota exceeded: monthly article limit (%) reached', limit_val USING ERRCODE='P0001'; END IF;
  ELSIF p_job_type = 'image_generation' THEN
    limit_val := (usage->>'monthly_image_limit')::bigint; used := (usage->>'images_this_month')::bigint;
    IF used >= limit_val THEN RAISE EXCEPTION 'Quota exceeded: monthly image limit (%) reached', limit_val USING ERRCODE='P0001'; END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.check_organization_quota(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_organization_quota(uuid, text) TO authenticated, service_role;

-- Patch enqueue to enforce quota (keep original signature; add check after auth)
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
  IF p_job_type NOT IN ('content_pipeline','image_generation','publish_content','autopilot_tick') THEN RAISE EXCEPTION 'Unsupported job type: %', p_job_type USING ERRCODE='22023'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Job payload must be a JSON object' USING ERRCODE='22023'; END IF;
  IF p_blog_id IS NOT NULL THEN
    SELECT blog.organization_id INTO resolved_organization_id FROM public.blogs blog WHERE blog.id = p_blog_id;
    IF resolved_organization_id IS NULL THEN RAISE EXCEPTION 'Blog not found' USING ERRCODE='P0002'; END IF;
    IF p_organization_id IS NOT NULL AND p_organization_id <> resolved_organization_id THEN RAISE EXCEPTION 'Blog does not belong to the requested organization' USING ERRCODE='42501'; END IF;
  ELSE resolved_organization_id := COALESCE(p_organization_id, (SELECT private.current_organization_id())); END IF;
  IF resolved_organization_id IS NULL OR NOT private.has_organization_role(resolved_organization_id, ARRAY['owner','admin','editor']) THEN RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE='42501'; END IF;
  IF p_job_type='autopilot_tick' AND NOT private.has_organization_role(resolved_organization_id, ARRAY['owner','admin']) THEN RAISE EXCEPTION 'Autopilot jobs require owner or admin role' USING ERRCODE='42501'; END IF;
  -- Quota check for billable job types
  IF p_job_type IN ('content_pipeline','image_generation') THEN PERFORM public.check_organization_quota(resolved_organization_id, p_job_type); END IF;
  INSERT INTO public.background_jobs (organization_id, blog_id, job_type, payload, priority, max_attempts, idempotency_key, scheduled_at, created_by)
  VALUES (resolved_organization_id, p_blog_id, p_job_type, p_payload, p_priority, p_max_attempts, NULLIF(trim(p_idempotency_key),''), GREATEST(COALESCE(p_scheduled_at, now()), now() - interval '1 minute'), actor_id)
  ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key RETURNING * INTO inserted_job;
  RETURN inserted_job;
END;
$$;

-- 2) Fair scheduling: round-robin by organization_id to avoid starvation
-- Replace claim_background_jobs to order by organization starvation first, then priority.
CREATE OR REPLACE FUNCTION public.claim_background_jobs(p_worker_id text, p_limit integer DEFAULT 5, p_lease_seconds integer DEFAULT 300)
RETURNS SETOF public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_worker_id IS NULL OR length(trim(p_worker_id)) < 3 THEN RAISE EXCEPTION 'A worker identifier is required' USING ERRCODE='22023'; END IF;
  IF p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds NOT BETWEEN 30 AND 1800 THEN RAISE EXCEPTION 'Invalid claim limits' USING ERRCODE='22023'; END IF;
  UPDATE public.background_jobs SET status = CASE WHEN attempts >= max_attempts THEN 'dead_letter' ELSE 'retrying' END,
    scheduled_at = CASE WHEN attempts >= max_attempts THEN scheduled_at ELSE now() END,
    failed_at = CASE WHEN attempts >= max_attempts THEN now() ELSE failed_at END,
    last_error = COALESCE(last_error, 'Worker lease expired before completion'), claimed_at=NULL, claimed_by=NULL, lease_expires_at=NULL
  WHERE status='running' AND lease_expires_at < now();
  RETURN QUERY WITH org_backlog AS (
    SELECT organization_id, count(*)::int AS queued_count FROM public.background_jobs WHERE status IN ('queued','retrying') AND scheduled_at <= now() GROUP BY organization_id
  ), candidates AS (
    SELECT job.id, job.organization_id, job.priority, job.scheduled_at, job.created_at,
           COALESCE(ob.queued_count,0) AS org_backlog,
           (SELECT count(*) FROM public.background_jobs r WHERE r.organization_id = job.organization_id AND r.status='running') AS org_running
    FROM public.background_jobs job JOIN public.organizations organization ON organization.id=job.organization_id LEFT JOIN public.blogs blog ON blog.id=job.blog_id LEFT JOIN org_backlog ob ON ob.organization_id=job.organization_id
    WHERE job.status IN ('queued','retrying') AND job.scheduled_at <= now() AND job.attempts < job.max_attempts AND organization.status='active' AND (job.blog_id IS NULL OR blog.status='active')
    ORDER BY org_running ASC, org_backlog DESC, job.priority ASC, job.scheduled_at ASC, job.created_at ASC
    FOR UPDATE OF job SKIP LOCKED LIMIT p_limit
  ) UPDATE public.background_jobs job SET status='running', attempts=job.attempts+1, claimed_at=now(), claimed_by=trim(p_worker_id), lease_expires_at=now()+make_interval(secs=>p_lease_seconds)
  FROM candidates WHERE job.id=candidates.id RETURNING job.*;
END;
$$;

COMMENT ON TABLE public.organization_quotas IS 'P2: monthly quotas per organization; enforced at enqueue time.';
