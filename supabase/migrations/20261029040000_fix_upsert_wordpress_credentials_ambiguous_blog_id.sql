-- Fix: "column reference \"blog_id\" is ambiguous" when saving WordPress credentials.
--
-- The RETURNS TABLE(blog_id, organization_id, ...) output columns share names with
-- columns of public.blog_wordpress_credentials. Inside plpgsql, unqualified references
-- such as ON CONFLICT (blog_id) became ambiguous. `#variable_conflict use_column`
-- makes plpgsql resolve those references to table columns.
--
-- Behaviour is otherwise unchanged. Applied to the database first, then committed here.

CREATE OR REPLACE FUNCTION public.upsert_blog_wordpress_credentials(
  p_blog_id uuid,
  p_site_url text,
  p_wp_username text,
  p_wp_application_password text,
  p_enabled boolean DEFAULT true
)
RETURNS TABLE(
  blog_id uuid,
  organization_id uuid,
  site_url text,
  wp_username text,
  enabled boolean,
  configured boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
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
$function$;
