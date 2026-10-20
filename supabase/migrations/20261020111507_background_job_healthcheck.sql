-- Operational health summary for trusted automation and diagnostics only.
CREATE OR REPLACE FUNCTION public.get_background_job_health()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'checked_at', now(),
    'cron_active', EXISTS (
      SELECT 1 FROM cron.job
      WHERE jobname = 'supabase-process-background-jobs' AND active
    ),
    'cron_schedule', (
      SELECT schedule FROM cron.job
      WHERE jobname = 'supabase-process-background-jobs'
      LIMIT 1
    ),
    'job_counts', COALESCE((
      SELECT jsonb_object_agg(counts.status, counts.total)
      FROM (
        SELECT job.status, count(*) AS total
        FROM public.background_jobs job
        GROUP BY job.status
      ) counts
    ), '{}'::jsonb),
    'latest_run', (
      SELECT jsonb_build_object(
        'status', details.status,
        'start_time', details.start_time,
        'end_time', details.end_time,
        'return_message', left(details.return_message, 500)
      )
      FROM cron.job_run_details details
      JOIN cron.job job ON job.jobid = details.jobid
      WHERE job.jobname = 'supabase-process-background-jobs'
      ORDER BY details.start_time DESC
      LIMIT 1
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_background_job_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_background_job_health() TO service_role;
