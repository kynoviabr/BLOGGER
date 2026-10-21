-- P2 Dashboard Ops: dead_letter replay + metrics

-- Replay a dead_letter job by resetting to queued (owner/admin only within org)
CREATE OR REPLACE FUNCTION public.retry_dead_letter_job(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE target_org uuid; updated_count int;
BEGIN
  SELECT organization_id INTO target_org FROM public.background_jobs WHERE id = p_job_id;
  IF target_org IS NULL OR NOT private.has_organization_role(target_org, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE = '42501';
  END IF;
  UPDATE public.background_jobs
  SET status = 'queued', attempts = 0, last_error = NULL, failed_at = NULL,
      scheduled_at = now(), claimed_at = NULL, claimed_by = NULL, lease_expires_at = NULL
  WHERE id = p_job_id AND organization_id = target_org AND status = 'dead_letter';
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_dead_letter_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_dead_letter_job(uuid) TO authenticated, service_role;

-- Metrics RPC for dashboard (jobs by status/type + ai_runs + costs)
CREATE OR REPLACE FUNCTION public.get_ops_metrics(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE org uuid := (SELECT private.current_organization_id());
  counts jsonb; type_counts jsonb; ai jsonb; usage jsonb;
BEGIN
  IF org IS NULL OR NOT private.is_organization_member(org) THEN
    RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_object_agg(status, cnt) INTO counts FROM (
    SELECT status, count(*)::int AS cnt FROM public.background_jobs
    WHERE organization_id = org GROUP BY status
  ) s;

  SELECT jsonb_object_agg(job_type, cnt) INTO type_counts FROM (
    SELECT job_type, count(*)::int AS cnt FROM public.background_jobs
    WHERE organization_id = org AND created_at >= now() - make_interval(days => GREATEST(p_days,1))
    GROUP BY job_type
  ) t;

  SELECT jsonb_build_object(
    'total', count(*)::int,
    'completed', count(*) FILTER (WHERE status='completed')::int,
    'failed', count(*) FILTER (WHERE status='failed')::int,
    'avg_duration_ms', COALESCE(avg(duration_ms)::int, 0),
    'total_cost', COALESCE(sum(estimated_cost),0)
  ) INTO ai FROM public.ai_runs
  WHERE content_id IN (SELECT id FROM public.content_items WHERE blog_id IN (SELECT id FROM public.blogs WHERE organization_id = org))
    AND created_at >= now() - make_interval(days => GREATEST(p_days,1));

  BEGIN
    SELECT public.get_organization_quota_usage(org) INTO usage;
  EXCEPTION WHEN OTHERS THEN
    usage := jsonb_build_object('organization_id', org);
  END;

  RETURN jsonb_build_object(
    'organization_id', org,
    'jobs_by_status', COALESCE(counts, '{}'::jsonb),
    'jobs_by_type_7d', COALESCE(type_counts, '{}'::jsonb),
    'ai_runs_7d', COALESCE(ai, '{}'::jsonb),
    'quotas', COALESCE(usage, '{}'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_ops_metrics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ops_metrics(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.retry_dead_letter_job(uuid) IS 'P2: owner/admin replay of dead_letter jobs';
COMMENT ON FUNCTION public.get_ops_metrics(integer) IS 'P2: dashboard metrics (jobs, ai_runs, quotas) scoped to caller org';
