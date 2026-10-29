-- A cota contava jobs, não artigos: cada artigo passa por várias execuções de
-- content_pipeline (espera da pesquisa, novas tentativas, reenfileiramentos),
-- então um artigo consumia várias unidades da cota. Agora conta artigos e
-- imagens distintos (por contentId) no mês.
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
  SELECT count(DISTINCT COALESCE(payload->>'contentId', id::text)) INTO articles_this_month
    FROM public.background_jobs
    WHERE organization_id = org AND job_type='content_pipeline' AND status <> 'cancelled' AND created_at >= date_trunc('month', now());
  SELECT count(DISTINCT COALESCE(payload->>'contentId', id::text)) INTO images_this_month
    FROM public.background_jobs
    WHERE organization_id = org AND job_type='image_generation' AND status <> 'cancelled' AND created_at >= date_trunc('month', now());
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
