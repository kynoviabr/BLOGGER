-- Destrava a geração de artigos.
--
-- 1) O worker (Edge Function, chave service_role) chama enqueue_background_job
--    para encadear pesquisa -> redação e para o autopilot. A função exigia
--    auth.uid(), que é NULL para service_role, então o encadeamento falhava em
--    silêncio e os artigos ficavam parados em "researching".
-- 2) A pesquisa grava fontes com upsert em (content_id, url), mas não havia
--    índice único para isso, então nenhuma fonte era salva.
-- 3) Reenfileira os artigos que ficaram presos em "researching".

CREATE OR REPLACE FUNCTION public.enqueue_background_job(
  p_job_type text, p_payload jsonb DEFAULT '{}'::jsonb, p_organization_id uuid DEFAULT NULL, p_blog_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL, p_scheduled_at timestamptz DEFAULT now(), p_priority smallint DEFAULT 100, p_max_attempts smallint DEFAULT 5
)
RETURNS public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  is_service boolean := actor_id IS NULL AND (SELECT auth.role()) = 'service_role';
  resolved_organization_id uuid;
  inserted_job public.background_jobs;
BEGIN
  IF actor_id IS NULL AND NOT is_service THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_job_type NOT IN ('research','content_pipeline','image_generation','publish_content','autopilot_tick') THEN RAISE EXCEPTION 'Unsupported job type: %', p_job_type USING ERRCODE='22023'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Job payload must be a JSON object' USING ERRCODE='22023'; END IF;
  IF p_blog_id IS NOT NULL THEN
    SELECT blog.organization_id INTO resolved_organization_id FROM public.blogs blog WHERE blog.id = p_blog_id;
    IF resolved_organization_id IS NULL THEN RAISE EXCEPTION 'Blog not found' USING ERRCODE='P0002'; END IF;
    IF p_organization_id IS NOT NULL AND p_organization_id <> resolved_organization_id THEN RAISE EXCEPTION 'Blog does not belong to the requested organization' USING ERRCODE='42501'; END IF;
  ELSIF is_service THEN
    resolved_organization_id := p_organization_id;
  ELSE
    resolved_organization_id := COALESCE(p_organization_id, (SELECT private.current_organization_id()));
  END IF;
  IF resolved_organization_id IS NULL THEN RAISE EXCEPTION 'Organization is required' USING ERRCODE='22023'; END IF;

  -- O worker continua trabalho já autorizado (e já contado na cota) por um usuário.
  IF NOT is_service THEN
    IF NOT private.has_organization_role(resolved_organization_id, ARRAY['owner','admin','editor']) THEN RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE='42501'; END IF;
    IF p_job_type='autopilot_tick' AND NOT private.has_organization_role(resolved_organization_id, ARRAY['owner','admin']) THEN RAISE EXCEPTION 'Autopilot jobs require owner or admin role' USING ERRCODE='42501'; END IF;
    IF p_job_type IN ('content_pipeline','image_generation') THEN PERFORM public.check_organization_quota(resolved_organization_id, p_job_type); END IF;
  END IF;

  INSERT INTO public.background_jobs (organization_id, blog_id, job_type, payload, priority, max_attempts, idempotency_key, scheduled_at, created_by)
  VALUES (resolved_organization_id, p_blog_id, p_job_type, p_payload, p_priority, p_max_attempts, NULLIF(trim(p_idempotency_key),''), GREATEST(COALESCE(p_scheduled_at, now()), now() - interval '1 minute'), actor_id)
  ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key RETURNING * INTO inserted_job;
  RETURN inserted_job;
END;
$$;

-- Fontes duplicadas por artigo são removidas antes do índice único.
DELETE FROM public.content_sources a
USING public.content_sources b
WHERE a.content_id = b.content_id AND a.url = b.url AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_sources_content_url
  ON public.content_sources (content_id, url);

-- Artigos presos em "researching" sem nenhum job ativo voltam para a fila.
INSERT INTO public.background_jobs (organization_id, blog_id, job_type, payload, priority, max_attempts, idempotency_key)
SELECT blog.organization_id, item.blog_id, 'content_pipeline',
       jsonb_build_object('contentId', item.id, 'calendarId', item.editorial_calendar_id, 'language', COALESCE(item.language, 'pt-BR'), 'requestedBy', 'rescue-20261029'),
       50, 3, 'content_pipeline:' || item.id || ':rescue-20261029'
FROM public.content_items item
JOIN public.blogs blog ON blog.id = item.blog_id
WHERE item.status = 'researching'
  AND NOT EXISTS (
    SELECT 1 FROM public.background_jobs job
    WHERE job.payload->>'contentId' = item.id::text
      AND job.status IN ('queued', 'running', 'retrying')
  )
ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
