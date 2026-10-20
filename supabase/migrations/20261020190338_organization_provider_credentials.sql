-- Per-organization provider configuration. API keys live in Supabase Vault;
-- this table contains only routing metadata and is never directly exposed.
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE public.organization_provider_credentials (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('deepseek', 'gemini', 'openai', 'together')),
  vault_secret_id uuid NOT NULL UNIQUE,
  model text,
  base_url text,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, provider),
  CONSTRAINT provider_model_length CHECK (model IS NULL OR length(model) <= 150),
  CONSTRAINT provider_base_url_length CHECK (base_url IS NULL OR length(base_url) <= 500)
);

CREATE TRIGGER update_organization_provider_credentials_updated_at
  BEFORE UPDATE ON public.organization_provider_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.organization_provider_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_provider_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.organization_provider_credentials TO service_role;

CREATE OR REPLACE FUNCTION public.list_provider_credentials(
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  organization_id uuid,
  provider text,
  model text,
  base_url text,
  enabled boolean,
  configured boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_organization_id uuid := COALESCE(p_organization_id, (SELECT private.current_organization_id()));
BEGIN
  IF target_organization_id IS NULL OR NOT private.is_organization_member(target_organization_id) THEN
    RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT credential.organization_id, credential.provider, credential.model,
    credential.base_url, credential.enabled, true, credential.updated_at
  FROM public.organization_provider_credentials credential
  WHERE credential.organization_id = target_organization_id
  ORDER BY credential.provider;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_provider_credential(
  p_provider text,
  p_api_key text,
  p_model text DEFAULT NULL,
  p_base_url text DEFAULT NULL,
  p_enabled boolean DEFAULT true,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  organization_id uuid,
  provider text,
  model text,
  base_url text,
  enabled boolean,
  configured boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_organization_id uuid := COALESCE(p_organization_id, (SELECT private.current_organization_id()));
  normalized_provider text := lower(trim(p_provider));
  existing_secret_id uuid;
  target_secret_id uuid;
  secret_name text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF target_organization_id IS NULL OR NOT private.has_organization_role(
    target_organization_id, ARRAY['owner', 'admin']
  ) THEN
    RAISE EXCEPTION 'Only organization owners and admins can manage provider credentials' USING ERRCODE = '42501';
  END IF;
  IF normalized_provider NOT IN ('deepseek', 'gemini', 'openai', 'together') THEN
    RAISE EXCEPTION 'Unsupported provider' USING ERRCODE = '22023';
  END IF;
  IF p_api_key IS NULL OR length(trim(p_api_key)) < 8 OR length(p_api_key) > 8192 THEN
    RAISE EXCEPTION 'API key must contain between 8 and 8192 characters' USING ERRCODE = '22023';
  END IF;
  IF p_base_url IS NOT NULL AND p_base_url !~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Base URL must use HTTPS' USING ERRCODE = '22023';
  END IF;

  SELECT credential.vault_secret_id INTO existing_secret_id
  FROM public.organization_provider_credentials credential
  WHERE credential.organization_id = target_organization_id
    AND credential.provider = normalized_provider
  FOR UPDATE;

  secret_name := 'org.' || target_organization_id::text || '.' || normalized_provider || '.api_key';
  IF existing_secret_id IS NULL THEN
    SELECT vault.create_secret(p_api_key, secret_name, 'Managed by BLOGGER settings panel')
      INTO target_secret_id;
  ELSE
    PERFORM vault.update_secret(existing_secret_id, p_api_key, secret_name, 'Managed by BLOGGER settings panel');
    target_secret_id := existing_secret_id;
  END IF;

  INSERT INTO public.organization_provider_credentials (
    organization_id, provider, vault_secret_id, model, base_url, enabled, updated_by
  ) VALUES (
    target_organization_id, normalized_provider, target_secret_id,
    NULLIF(trim(p_model), ''), NULLIF(trim(p_base_url), ''), p_enabled, actor_id
  )
  ON CONFLICT (organization_id, provider) DO UPDATE SET
    model = EXCLUDED.model,
    base_url = EXCLUDED.base_url,
    enabled = EXCLUDED.enabled,
    updated_by = actor_id;

  RETURN QUERY
  SELECT credential.organization_id, credential.provider, credential.model,
    credential.base_url, credential.enabled, true, credential.updated_at
  FROM public.organization_provider_credentials credential
  WHERE credential.organization_id = target_organization_id
    AND credential.provider = normalized_provider;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_provider_runtime_config(
  p_organization_id uuid,
  p_provider text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'provider', credential.provider,
    'apiKey', secret.decrypted_secret,
    'model', credential.model,
    'baseUrl', credential.base_url,
    'enabled', credential.enabled
  )
  FROM public.organization_provider_credentials credential
  JOIN vault.decrypted_secrets secret ON secret.id = credential.vault_secret_id
  WHERE credential.organization_id = p_organization_id
    AND credential.provider = lower(trim(p_provider))
    AND credential.enabled = true;
$$;

REVOKE ALL ON FUNCTION public.list_provider_credentials(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_provider_credential(text, text, text, text, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_provider_runtime_config(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_provider_credentials(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_provider_credential(text, text, text, text, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_runtime_config(uuid, text) TO service_role;

COMMENT ON TABLE public.organization_provider_credentials IS
  'Tenant-scoped AI provider routing. API keys are encrypted in Supabase Vault.';
