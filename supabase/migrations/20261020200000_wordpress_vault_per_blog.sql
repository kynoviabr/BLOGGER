-- P2: WordPress credentials per blog via Supabase Vault (same pattern as organization_provider_credentials).
-- Never store wp_application_password in editorial_config JSON again.

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE IF NOT EXISTS public.blog_wordpress_credentials (
  blog_id uuid PRIMARY KEY REFERENCES public.blogs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_url text NOT NULL CHECK (length(site_url) BETWEEN 8 AND 500 AND site_url ~ '^https://[^[:space:]]+$'),
  wp_username text NOT NULL CHECK (length(wp_username) BETWEEN 1 AND 200),
  vault_secret_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_wordpress_credentials_org_consistency CHECK (
    -- enforced via trigger below; keep as placeholder for documentation
    true
  )
);

CREATE OR REPLACE FUNCTION private.enforce_blog_wordpress_org_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  blog_org uuid;
BEGIN
  SELECT organization_id INTO blog_org FROM public.blogs WHERE id = NEW.blog_id;
  IF blog_org IS NULL THEN
    RAISE EXCEPTION 'Blog not found' USING ERRCODE = 'P0002';
  END IF;
  IF blog_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Blog does not belong to the specified organization' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_blog_wordpress_org_consistency ON public.blog_wordpress_credentials;
CREATE TRIGGER enforce_blog_wordpress_org_consistency
  BEFORE INSERT OR UPDATE OF blog_id, organization_id ON public.blog_wordpress_credentials
  FOR EACH ROW EXECUTE FUNCTION private.enforce_blog_wordpress_org_consistency();

CREATE TRIGGER update_blog_wordpress_credentials_updated_at
  BEFORE UPDATE ON public.blog_wordpress_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.blog_wordpress_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blog_wordpress_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.blog_wordpress_credentials TO service_role;

-- RPC: list (metadata only, never the secret)
CREATE OR REPLACE FUNCTION public.list_blog_wordpress_credentials(p_blog_id uuid DEFAULT NULL)
RETURNS TABLE (blog_id uuid, organization_id uuid, site_url text, wp_username text, enabled boolean, configured boolean, updated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_blog_id uuid := p_blog_id;
  target_org uuid;
BEGIN
  IF target_blog_id IS NULL THEN
    RAISE EXCEPTION 'blog_id is required' USING ERRCODE = '22023';
  END IF;
  SELECT b.organization_id INTO target_org FROM public.blogs b WHERE b.id = target_blog_id;
  IF target_org IS NULL OR NOT private.is_organization_member(target_org) THEN
    RAISE EXCEPTION 'Insufficient organization access' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.blog_id, c.organization_id, c.site_url, c.wp_username, c.enabled, true, c.updated_at
  FROM public.blog_wordpress_credentials c WHERE c.blog_id = target_blog_id;
END;
$$;

-- RPC: upsert (owner/admin only, validates site_url/password, stores in Vault)
CREATE OR REPLACE FUNCTION public.upsert_blog_wordpress_credentials(
  p_blog_id uuid,
  p_site_url text,
  p_wp_username text,
  p_wp_application_password text,
  p_enabled boolean DEFAULT true
)
RETURNS TABLE (blog_id uuid, organization_id uuid, site_url text, wp_username text, enabled boolean, configured boolean, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  blog_org uuid;
  existing_secret_id uuid;
  target_secret_id uuid;
  secret_name text;
  norm_url text := trim(p_site_url);
  norm_user text := trim(p_wp_username);
  norm_pass text := trim(p_wp_application_password);
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT b.organization_id INTO blog_org FROM public.blogs b WHERE b.id = p_blog_id;
  IF blog_org IS NULL THEN RAISE EXCEPTION 'Blog not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT private.has_organization_role(blog_org, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Only organization owners and admins can manage WordPress credentials' USING ERRCODE = '42501';
  END IF;
  IF norm_url IS NULL OR norm_url !~ '^https://[^[:space:]]+$' OR length(norm_url) > 500 THEN
    RAISE EXCEPTION 'site_url must be a valid https URL' USING ERRCODE = '22023';
  END IF;
  IF norm_user IS NULL OR length(norm_user) < 1 OR length(norm_user) > 200 THEN
    RAISE EXCEPTION 'wp_username is required' USING ERRCODE = '22023';
  END IF;
  IF norm_pass IS NULL OR length(norm_pass) < 8 OR length(norm_pass) > 8192 THEN
    RAISE EXCEPTION 'wp_application_password must be 8..8192 chars' USING ERRCODE = '22023';
  END IF;

  SELECT c.vault_secret_id INTO existing_secret_id FROM public.blog_wordpress_credentials c WHERE c.blog_id = p_blog_id FOR UPDATE;
  secret_name := 'blog.' || p_blog_id::text || '.wordpress.app_password';
  IF existing_secret_id IS NULL THEN
    SELECT vault.create_secret(norm_pass, secret_name, 'WordPress Application Password for blog ' || p_blog_id::text) INTO target_secret_id;
  ELSE
    PERFORM vault.update_secret(existing_secret_id, norm_pass, secret_name, 'WordPress Application Password for blog ' || p_blog_id::text);
    target_secret_id := existing_secret_id;
  END IF;

  INSERT INTO public.blog_wordpress_credentials (blog_id, organization_id, site_url, wp_username, vault_secret_id, enabled, updated_by)
  VALUES (p_blog_id, blog_org, norm_url, norm_user, target_secret_id, COALESCE(p_enabled,true), actor_id)
  ON CONFLICT (blog_id) DO UPDATE SET site_url = EXCLUDED.site_url, wp_username = EXCLUDED.wp_username, vault_secret_id = EXCLUDED.vault_secret_id, enabled = EXCLUDED.enabled, updated_by = actor_id;

  RETURN QUERY SELECT c.blog_id, c.organization_id, c.site_url, c.wp_username, c.enabled, true, c.updated_at FROM public.blog_wordpress_credentials c WHERE c.blog_id = p_blog_id;
END;
$$;

-- RPC: runtime config for service_role only (worker + publish-content)
CREATE OR REPLACE FUNCTION public.get_blog_wordpress_runtime_config(p_blog_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('siteUrl', c.site_url, 'username', c.wp_username, 'applicationPassword', s.decrypted_secret, 'enabled', c.enabled)
  FROM public.blog_wordpress_credentials c JOIN vault.decrypted_secrets s ON s.id = c.vault_secret_id
  WHERE c.blog_id = p_blog_id AND c.enabled = true;
$$;

REVOKE ALL ON FUNCTION public.list_blog_wordpress_credentials(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_blog_wordpress_credentials(uuid, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_blog_wordpress_runtime_config(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_blog_wordpress_credentials(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_blog_wordpress_credentials(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_blog_wordpress_runtime_config(uuid) TO service_role;

COMMENT ON TABLE public.blog_wordpress_credentials IS 'Per-blog WordPress credentials via Vault; plaintext never stored in editorial_config.';
