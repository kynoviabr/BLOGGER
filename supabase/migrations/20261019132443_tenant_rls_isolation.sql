-- Phase 2: enforce organization isolation throughout the tenant data graph.
-- Vercel remains hosting-only; operational tables stay service-role only.

CREATE OR REPLACE FUNCTION private.can_read_blog(target_blog_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blogs blog
    JOIN public.organization_members membership
      ON membership.organization_id = blog.organization_id
    WHERE blog.id = target_blog_id
      AND membership.user_id = (SELECT auth.uid())
      AND membership.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.can_edit_blog(target_blog_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blogs blog
    JOIN public.organization_members membership
      ON membership.organization_id = blog.organization_id
    WHERE blog.id = target_blog_id
      AND membership.user_id = (SELECT auth.uid())
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'admin', 'editor')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_admin_blog(target_blog_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blogs blog
    JOIN public.organization_members membership
      ON membership.organization_id = blog.organization_id
    WHERE blog.id = target_blog_id
      AND membership.user_id = (SELECT auth.uid())
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_read_content(target_content_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.can_read_blog(content.blog_id)
  FROM public.content_items content
  WHERE content.id = target_content_id;
$$;

CREATE OR REPLACE FUNCTION private.can_edit_content(target_content_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.can_edit_blog(content.blog_id)
  FROM public.content_items content
  WHERE content.id = target_content_id;
$$;

CREATE OR REPLACE FUNCTION private.can_admin_content(target_content_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.can_admin_blog(content.blog_id)
  FROM public.content_items content
  WHERE content.id = target_content_id;
$$;

REVOKE ALL ON FUNCTION private.can_read_blog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_edit_blog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_admin_blog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_read_content(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_edit_content(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_admin_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_blog(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_edit_blog(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_admin_blog(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_read_content(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_edit_content(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_admin_content(uuid) TO authenticated, service_role;

ALTER TABLE public.system_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.system_logs
  ALTER COLUMN organization_id SET DEFAULT private.current_organization_id();

-- Prefer the blog carried in structured metadata; preserve legacy/internal logs
-- by assigning the sole existing organization when the installation has one.
UPDATE public.system_logs log
SET organization_id = blog.organization_id
FROM public.blogs blog
WHERE log.organization_id IS NULL
  AND log.metadata ? 'blogId'
  AND log.metadata->>'blogId' = blog.id::text;

UPDATE public.system_logs log
SET organization_id = organization.id
FROM (
  SELECT min(id::text)::uuid AS id
  FROM public.organizations
  HAVING count(*) = 1
) organization
WHERE log.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_system_logs_organization_created
  ON public.system_logs (organization_id, created_at DESC);

-- Remove all legacy permissive policies from tenant-owned tables. Service role
-- bypasses RLS and therefore does not need duplicate permissive policies.
DO $$
DECLARE policy record;
BEGIN
  FOR policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'blog_languages', 'categories', 'editorial_calendar', 'content_items',
        'content_sources', 'media_assets', 'ai_runs', 'monetization_offers',
        'system_logs', 'youtube_channels', 'video_jobs'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy.policyname, policy.schemaname, policy.tablename);
  END LOOP;
END $$;

-- Direct blog-owned tables.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'blog_languages', 'categories', 'editorial_calendar', 'content_items',
    'media_assets', 'monetization_offers'
  ]
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT private.can_read_blog(blog_id)))', table_name || '_select_member', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit_blog(blog_id)))', table_name || '_insert_editor', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT private.can_edit_blog(blog_id))) WITH CHECK ((SELECT private.can_edit_blog(blog_id)))', table_name || '_update_editor', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((SELECT private.can_admin_blog(blog_id)))', table_name || '_delete_admin', table_name);
  END LOOP;
END $$;

-- Tables owned indirectly through content_items.
CREATE POLICY content_sources_select_member ON public.content_sources
  FOR SELECT TO authenticated USING ((SELECT private.can_read_content(content_id)));
CREATE POLICY content_sources_insert_editor ON public.content_sources
  FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit_content(content_id)));
CREATE POLICY content_sources_update_editor ON public.content_sources
  FOR UPDATE TO authenticated
  USING ((SELECT private.can_edit_content(content_id)))
  WITH CHECK ((SELECT private.can_edit_content(content_id)));
CREATE POLICY content_sources_delete_admin ON public.content_sources
  FOR DELETE TO authenticated USING ((SELECT private.can_admin_content(content_id)));

CREATE POLICY ai_runs_select_member ON public.ai_runs
  FOR SELECT TO authenticated USING (content_id IS NOT NULL AND (SELECT private.can_read_content(content_id)));
CREATE POLICY ai_runs_insert_editor ON public.ai_runs
  FOR INSERT TO authenticated WITH CHECK (content_id IS NOT NULL AND (SELECT private.can_edit_content(content_id)));
CREATE POLICY ai_runs_update_editor ON public.ai_runs
  FOR UPDATE TO authenticated
  USING (content_id IS NOT NULL AND (SELECT private.can_edit_content(content_id)))
  WITH CHECK (content_id IS NOT NULL AND (SELECT private.can_edit_content(content_id)));
CREATE POLICY ai_runs_delete_admin ON public.ai_runs
  FOR DELETE TO authenticated USING (content_id IS NOT NULL AND (SELECT private.can_admin_content(content_id)));

-- User-visible logs are explicitly scoped to an organization. Null organization
-- remains reserved for internal service-role diagnostics.
CREATE POLICY system_logs_select_member ON public.system_logs
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND (SELECT private.is_organization_member(organization_id)));
CREATE POLICY system_logs_insert_editor ON public.system_logs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL AND (SELECT private.has_organization_role(organization_id, ARRAY['owner', 'admin', 'editor'])));
CREATE POLICY system_logs_delete_admin ON public.system_logs
  FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL AND (SELECT private.has_organization_role(organization_id, ARRAY['owner', 'admin'])));

-- YouTube channels may be shared only between blogs inside organizations the
-- current user belongs to. Tokens remain server-side columns.
CREATE POLICY youtube_channels_select_member ON public.youtube_channels
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.blogs blog
    WHERE blog.youtube_channel_id = youtube_channels.id
      AND (SELECT private.can_read_blog(blog.id))
  ));
CREATE POLICY youtube_channels_update_editor ON public.youtube_channels
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.blogs blog
    WHERE blog.youtube_channel_id = youtube_channels.id
      AND (SELECT private.can_edit_blog(blog.id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.blogs blog
    WHERE blog.youtube_channel_id = youtube_channels.id
      AND (SELECT private.can_edit_blog(blog.id))
  ));

CREATE POLICY video_jobs_select_member ON public.video_jobs
  FOR SELECT TO authenticated USING ((SELECT private.can_read_content(post_id)));
CREATE POLICY video_jobs_insert_editor ON public.video_jobs
  FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit_content(post_id)));
CREATE POLICY video_jobs_update_editor ON public.video_jobs
  FOR UPDATE TO authenticated
  USING ((SELECT private.can_edit_content(post_id)))
  WITH CHECK ((SELECT private.can_edit_content(post_id)));
CREATE POLICY video_jobs_delete_admin ON public.video_jobs
  FOR DELETE TO authenticated USING ((SELECT private.can_admin_content(post_id)));

-- Internal scheduler/configuration data must never be reachable with a user JWT.
REVOKE ALL ON public.pipeline_secrets, public.pipeline_settings FROM anon, authenticated;
GRANT ALL ON public.pipeline_secrets, public.pipeline_settings TO service_role;

-- Explicit least-privilege grants for tenant tables.
REVOKE ALL ON public.blog_languages, public.categories, public.editorial_calendar,
  public.content_items, public.content_sources, public.media_assets, public.ai_runs,
  public.monetization_offers, public.system_logs, public.youtube_channels,
  public.video_jobs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_languages, public.categories,
  public.editorial_calendar, public.content_items, public.content_sources,
  public.media_assets, public.ai_runs, public.monetization_offers, public.system_logs,
  public.youtube_channels, public.video_jobs TO authenticated;
GRANT ALL ON public.blog_languages, public.categories, public.editorial_calendar,
  public.content_items, public.content_sources, public.media_assets, public.ai_runs,
  public.monetization_offers, public.system_logs, public.youtube_channels,
  public.video_jobs TO service_role;

-- The object path starts with blog_id. Public delivery remains available for
-- published images, while writes are restricted to editors of that blog.
DROP POLICY IF EXISTS blog_assets_insert_editor ON storage.objects;
DROP POLICY IF EXISTS blog_assets_update_editor ON storage.objects;
DROP POLICY IF EXISTS blog_assets_delete_editor ON storage.objects;
CREATE POLICY blog_assets_insert_editor ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'blog-assets'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND (SELECT private.can_edit_blog(((storage.foldername(name))[1])::uuid))
  );
CREATE POLICY blog_assets_update_editor ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'blog-assets'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND (SELECT private.can_edit_blog(((storage.foldername(name))[1])::uuid))
  )
  WITH CHECK (
    bucket_id = 'blog-assets'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND (SELECT private.can_edit_blog(((storage.foldername(name))[1])::uuid))
  );
CREATE POLICY blog_assets_delete_editor ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'blog-assets'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND (SELECT private.can_edit_blog(((storage.foldername(name))[1])::uuid))
  );

-- Close the remaining security-advisor findings under our control.
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
