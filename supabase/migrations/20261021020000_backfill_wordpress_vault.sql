-- Backfill WordPress Vault: move editorial_config.wordpress.wp_application_password -> blog_wordpress_credentials Vault
-- Idempotent: only blogs where editorial_config contains wp_application_password and no Vault row yet
DO $$
DECLARE
  r record;
  created_secret uuid;
  blog_org uuid;
BEGIN
  FOR r IN
    SELECT b.id, b.organization_id, b.domain,
           (b.editorial_config->'wordpress'->>'wp_site_url') AS wp_site_url,
           (b.editorial_config->'wordpress'->>'wp_username') AS wp_username,
           (b.editorial_config->'wordpress'->>'wp_application_password') AS wp_password
    FROM public.blogs b
    WHERE b.editorial_config ? 'wordpress'
      AND (b.editorial_config->'wordpress' ? 'wp_application_password')
      AND length(trim(coalesce(b.editorial_config->'wordpress'->>'wp_application_password',''))) >= 8
  LOOP
    -- skip if Vault row already exists for this blog
    IF EXISTS (SELECT 1 FROM public.blog_wordpress_credentials c WHERE c.blog_id = r.id) THEN
      CONTINUE;
    END IF;
    blog_org := r.organization_id;
    IF r.wp_site_url IS NULL OR r.wp_site_url !~ '^https://' THEN
      r.wp_site_url := 'https://' || r.domain;
    END IF;
    IF r.wp_username IS NULL OR length(trim(r.wp_username)) = 0 THEN
      CONTINUE;
    END IF;

    BEGIN
      SELECT vault.create_secret(
        trim(r.wp_password),
        'blog.' || r.id::text || '.wordpress.app_password',
        'Migrated from editorial_config JSON'
      ) INTO created_secret;

      INSERT INTO public.blog_wordpress_credentials (blog_id, organization_id, site_url, wp_username, vault_secret_id, enabled)
      VALUES (r.id, blog_org, trim(r.wp_site_url), trim(r.wp_username), created_secret, true)
      ON CONFLICT (blog_id) DO NOTHING;

      -- Clear plaintext from JSON only after successful Vault insert
      UPDATE public.blogs
      SET editorial_config = jsonb_set(
        editorial_config,
        '{wordpress}',
        (editorial_config->'wordpress') - 'wp_application_password'
      )
      WHERE id = r.id;

      RAISE NOTICE 'Migrated WordPress Vault for blog %', r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to migrate blog %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
