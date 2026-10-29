-- Fluxo em etapas: a pauta é agendada no Calendário e o artigo (texto, SEO e
-- imagem) é produzido sozinho alguns dias antes da data. A antecedência é
-- ajustável em Settings (padrão: 2 dias). O artigo produzido vai para Revisão e
-- só é publicado depois de aprovado.

ALTER TABLE public.organization_quotas
  ADD COLUMN IF NOT EXISTS production_lead_days smallint NOT NULL DEFAULT 2
  CHECK (production_lead_days BETWEEN 0 AND 14);

CREATE OR REPLACE FUNCTION public.get_production_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE org uuid := (SELECT private.current_organization_id());
  lead smallint;
BEGIN
  IF org IS NULL OR NOT private.is_organization_member(org) THEN
    RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE='42501';
  END IF;
  SELECT quota.production_lead_days INTO lead FROM public.organization_quotas quota WHERE quota.organization_id = org;
  RETURN jsonb_build_object('production_lead_days', COALESCE(lead, 2));
END;
$$;

REVOKE ALL ON FUNCTION public.get_production_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_production_settings() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_production_lead_days(p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE org uuid := (SELECT private.current_organization_id());
BEGIN
  IF org IS NULL OR NOT private.has_organization_role(org, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE='42501';
  END IF;
  IF p_days IS NULL OR p_days < 0 OR p_days > 14 THEN
    RAISE EXCEPTION 'A antecedência deve ficar entre 0 e 14 dias' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.organization_quotas (organization_id, production_lead_days, updated_by)
  VALUES (org, p_days, (SELECT auth.uid()))
  ON CONFLICT (organization_id) DO UPDATE SET
    production_lead_days = EXCLUDED.production_lead_days,
    updated_by = EXCLUDED.updated_by;
  RETURN jsonb_build_object('production_lead_days', p_days);
END;
$$;

REVOKE ALL ON FUNCTION public.set_production_lead_days(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_production_lead_days(integer) TO authenticated, service_role;

-- Produz os artigos das pautas agendadas cuja data entrou na janela de
-- antecedência. Pautas que já têm artigo com texto (ou em produção) ficam de
-- fora; datas que passaram há mais de 7 dias também, para não ressuscitar
-- pautas esquecidas.
CREATE OR REPLACE FUNCTION private.enqueue_due_calendar_production()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pauta record;
  content_id uuid;
  enqueued integer := 0;
BEGIN
  FOR pauta IN
    SELECT calendar.id, calendar.blog_id, calendar.proposed_title, calendar.topic,
           COALESCE(calendar.language, blog.default_language, 'pt-BR') AS language,
           blog.organization_id
    FROM public.editorial_calendar calendar
    JOIN public.blogs blog ON blog.id = calendar.blog_id AND blog.status = 'active'
    LEFT JOIN public.organization_quotas quota ON quota.organization_id = blog.organization_id
    WHERE calendar.status IN ('SCHEDULED', 'PLANNED', 'READY', 'IN_PROGRESS')
      AND calendar.scheduled_at IS NOT NULL
      AND calendar.scheduled_at <= now() + make_interval(days => COALESCE(quota.production_lead_days, 2))
      AND calendar.scheduled_at > now() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.content_items item
        WHERE item.editorial_calendar_id = calendar.id
          AND item.status <> 'archived'
          AND (length(trim(COALESCE(item.body, ''))) > 0
               OR item.status IN ('researching', 'reviewing', 'ready', 'scheduled', 'publishing', 'published'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.background_jobs job
        WHERE job.job_type IN ('content_pipeline', 'research')
          AND job.status IN ('queued', 'running', 'retrying')
          AND job.payload->>'calendarId' = calendar.id::text
      )
    ORDER BY calendar.scheduled_at
    LIMIT 25
  LOOP
    BEGIN
      PERFORM public.check_organization_quota(pauta.organization_id, 'content_pipeline');
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    SELECT item.id INTO content_id
    FROM public.content_items item
    WHERE item.editorial_calendar_id = pauta.id AND item.status = 'draft'
    ORDER BY item.created_at DESC
    LIMIT 1;

    IF content_id IS NULL THEN
      INSERT INTO public.content_items (blog_id, editorial_calendar_id, title, slug, body, status, language)
      VALUES (pauta.blog_id, pauta.id, COALESCE(NULLIF(pauta.proposed_title, ''), pauta.topic, 'Gerando...'),
              'pauta-' || pauta.id::text, '', 'researching', pauta.language)
      ON CONFLICT (blog_id, slug) DO NOTHING
      RETURNING id INTO content_id;
      IF content_id IS NULL THEN
        CONTINUE;
      END IF;
    ELSE
      UPDATE public.content_items SET status = 'researching' WHERE id = content_id;
    END IF;

    INSERT INTO public.background_jobs (organization_id, blog_id, job_type, payload, priority, max_attempts, idempotency_key)
    VALUES (
      pauta.organization_id, pauta.blog_id, 'content_pipeline',
      jsonb_build_object('contentId', content_id, 'calendarId', pauta.id, 'language', pauta.language, 'requestedBy', 'calendar'),
      50, 3, 'calendar-production:' || pauta.id::text || ':' || content_id::text
    )
    ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

    UPDATE public.editorial_calendar SET status = 'IN_PROGRESS', updated_at = now()
    WHERE id = pauta.id AND status IN ('SCHEDULED', 'PLANNED', 'READY');
    INSERT INTO public.system_logs (organization_id, level, service, message, metadata)
    VALUES (pauta.organization_id, 'info', 'Calendar.autoProduction', 'Pauta do calendário enviada para produção',
            jsonb_build_object('calendarId', pauta.id, 'contentId', content_id));
    enqueued := enqueued + 1;
  END LOOP;
  RETURN enqueued;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_due_calendar_production() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE existing_job record;
BEGIN
  FOR existing_job IN SELECT jobid FROM cron.job WHERE jobname = 'calendar-auto-production' LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

SELECT cron.schedule('calendar-auto-production', '*/10 * * * *', $job$SELECT private.enqueue_due_calendar_production();$job$);
