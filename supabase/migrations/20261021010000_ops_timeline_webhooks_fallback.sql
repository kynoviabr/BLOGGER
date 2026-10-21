-- P5: job timeline + webhooks + provider fallback + quotas editable

-- 1) Webhooks per org (Slack/Discord/generic)
CREATE TABLE IF NOT EXISTS public.organization_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url ~ '^https://[^[:space:]]+$' AND length(url) <= 2000),
  events text[] NOT NULL DEFAULT ARRAY['dead_letter'] CHECK (array_length(events,1) BETWEEN 1 AND 10),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organization_webhooks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_webhooks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.organization_webhooks TO service_role;
CREATE POLICY organization_webhooks_select_member ON public.organization_webhooks FOR SELECT TO authenticated USING ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY organization_webhooks_insert_owner ON public.organization_webhooks FOR INSERT TO authenticated WITH CHECK ((SELECT private.has_organization_role(organization_id, ARRAY['owner','admin'])));
CREATE POLICY organization_webhooks_delete_owner ON public.organization_webhooks FOR DELETE TO authenticated USING ((SELECT private.has_organization_role(organization_id, ARRAY['owner','admin'])));
GRANT SELECT, INSERT, DELETE ON public.organization_webhooks TO authenticated;

-- 2) Provider fallback order per blog (e.g. deepseek -> gemini -> mock)
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS provider_fallback text[] NOT NULL DEFAULT ARRAY['deepseek','gemini']::text[];
-- keep Vault as source of truth for keys; this only orders attempts

-- 3) Allow quotas to be upserted by owner/admin
CREATE OR REPLACE FUNCTION public.upsert_organization_quotas(
  p_monthly_article_limit integer DEFAULT NULL,
  p_monthly_image_limit integer DEFAULT NULL,
  p_monthly_token_limit bigint DEFAULT NULL,
  p_enabled boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE org uuid := (SELECT private.current_organization_id());
  row public.organization_quotas;
BEGIN
  IF org IS NULL OR NOT private.has_organization_role(org, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.organization_quotas (organization_id, monthly_article_limit, monthly_image_limit, monthly_token_limit, enabled, updated_by)
  VALUES (org, COALESCE(p_monthly_article_limit,100), COALESCE(p_monthly_image_limit,200), p_monthly_token_limit, COALESCE(p_enabled,true), (SELECT auth.uid()))
  ON CONFLICT (organization_id) DO UPDATE SET
    monthly_article_limit = COALESCE(p_monthly_article_limit, public.organization_quotas.monthly_article_limit),
    monthly_image_limit = COALESCE(p_monthly_image_limit, public.organization_quotas.monthly_image_limit),
    monthly_token_limit = COALESCE(p_monthly_token_limit, public.organization_quotas.monthly_token_limit),
    enabled = COALESCE(p_enabled, public.organization_quotas.enabled),
    updated_by = (SELECT auth.uid())
  RETURNING * INTO row;
  RETURN jsonb_build_object('organization_id', row.organization_id, 'monthly_article_limit', row.monthly_article_limit, 'monthly_image_limit', row.monthly_image_limit, 'monthly_token_limit', row.monthly_token_limit, 'enabled', row.enabled);
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_organization_quotas(integer,integer,bigint,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_organization_quotas(integer,integer,bigint,boolean) TO authenticated, service_role;

-- 4) Enforce provider_fallback shape
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blogs_provider_fallback_check') THEN
    ALTER TABLE public.blogs ADD CONSTRAINT blogs_provider_fallback_check CHECK (array_length(provider_fallback,1) BETWEEN 1 AND 4);
  END IF;
END $$;

-- 5) Concurrency guard: add org_concurrency (optional) — simple advisory limit via function
ALTER TABLE public.organization_quotas ADD COLUMN IF NOT EXISTS max_concurrent_jobs integer CHECK (max_concurrent_jobs IS NULL OR max_concurrent_jobs BETWEEN 1 AND 20);

COMMENT ON TABLE public.organization_webhooks IS 'P5: webhooks for dead_letter and job events per org';
COMMENT ON FUNCTION public.upsert_organization_quotas(integer,integer,bigint,boolean) IS 'P5: owner/admin upsert quotas';
