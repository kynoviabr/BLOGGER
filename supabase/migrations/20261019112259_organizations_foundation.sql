-- Phase 1: multi-company foundation. Existing data is migrated without downtime.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  slug varchar(120) NOT NULL UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_members_updated_at ON public.organization_members;
CREATE TRIGGER update_organization_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS organization_id uuid;

DO $$
DECLARE
  initial_organization_id uuid;
  initial_owner_id uuid;
BEGIN
  SELECT id INTO initial_owner_id
  FROM auth.users
  ORDER BY created_at, id
  LIMIT 1;

  INSERT INTO public.organizations (name, slug, created_by)
  VALUES ('Kynovia', 'kynovia', initial_owner_id)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO initial_organization_id;

  UPDATE public.blogs
  SET organization_id = initial_organization_id
  WHERE organization_id IS NULL;

  INSERT INTO public.organization_members (organization_id, user_id, role, status, invited_by)
  SELECT
    initial_organization_id,
    ranked.id,
    CASE WHEN ranked.position = 1 THEN 'owner' ELSE 'admin' END,
    'active',
    initial_owner_id
  FROM (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS position
    FROM auth.users
  ) AS ranked
  ON CONFLICT (organization_id, user_id) DO NOTHING;
END $$;

ALTER TABLE public.blogs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.blogs DROP CONSTRAINT IF EXISTS blogs_organization_id_fkey;
ALTER TABLE public.blogs ADD CONSTRAINT blogs_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.blogs DROP CONSTRAINT IF EXISTS blogs_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_blog_slug
  ON public.blogs (organization_id, slug);
CREATE INDEX IF NOT EXISTS idx_organization_members_user
  ON public.organization_members (user_id, status, organization_id);
CREATE INDEX IF NOT EXISTS idx_blogs_organization
  ON public.blogs (organization_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION private.is_organization_member(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = (SELECT auth.uid())
      AND membership.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.has_organization_role(
  target_organization_id uuid,
  allowed_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = (SELECT auth.uid())
      AND membership.status = 'active'
      AND membership.role = ANY (allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_organization_creator(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations organization
    WHERE organization.id = target_organization_id
      AND organization.created_by = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership.organization_id
  FROM public.organization_members membership
  WHERE membership.user_id = (SELECT auth.uid())
    AND membership.status = 'active'
  ORDER BY membership.joined_at, membership.organization_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.is_organization_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_organization_role(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_organization_creator(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_organization_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_organization_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_organization_role(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_organization_creator(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_organization_id() TO authenticated, service_role;

-- Backward-compatible during rollout: old application versions that omit the
-- column still resolve the authenticated user's first active organization.
ALTER TABLE public.blogs
  ALTER COLUMN organization_id SET DEFAULT private.current_organization_id();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.organizations, public.organization_members FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations, public.organization_members TO authenticated;
GRANT ALL ON public.organizations, public.organization_members TO service_role;

CREATE POLICY organizations_select_member ON public.organizations
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(id)));

CREATE POLICY organizations_insert_creator ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY organizations_update_admin ON public.organizations
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_organization_role(id, ARRAY['owner', 'admin'])))
  WITH CHECK ((SELECT private.has_organization_role(id, ARRAY['owner', 'admin'])));

CREATE POLICY organizations_delete_owner ON public.organizations
  FOR DELETE TO authenticated
  USING ((SELECT private.has_organization_role(id, ARRAY['owner'])));

CREATE POLICY organization_members_select_member ON public.organization_members
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));

CREATE POLICY organization_members_insert_manager ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      user_id = (SELECT auth.uid())
      AND role = 'owner'
      AND (SELECT private.is_organization_creator(organization_id))
    )
    OR (SELECT private.has_organization_role(organization_id, ARRAY['owner']))
    OR (
      role IN ('editor', 'viewer')
      AND (SELECT private.has_organization_role(organization_id, ARRAY['admin']))
    )
  );

CREATE POLICY organization_members_update_manager ON public.organization_members
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.has_organization_role(organization_id, ARRAY['owner']))
    OR (
      role IN ('editor', 'viewer')
      AND (SELECT private.has_organization_role(organization_id, ARRAY['admin']))
    )
  )
  WITH CHECK (
    (SELECT private.has_organization_role(organization_id, ARRAY['owner']))
    OR (
      role IN ('editor', 'viewer')
      AND (SELECT private.has_organization_role(organization_id, ARRAY['admin']))
    )
  );

CREATE POLICY organization_members_delete_manager ON public.organization_members
  FOR DELETE TO authenticated
  USING (
    (SELECT private.has_organization_role(organization_id, ARRAY['owner']))
    OR (
      role IN ('editor', 'viewer')
      AND (SELECT private.has_organization_role(organization_id, ARRAY['admin']))
    )
  );

DROP POLICY IF EXISTS "allow_authenticated_all_blogs" ON public.blogs;
DROP POLICY IF EXISTS "authenticated_all_blogs" ON public.blogs;
DROP POLICY IF EXISTS "allow_service_role_all_blogs" ON public.blogs;
DROP POLICY IF EXISTS "service_role_all_blogs" ON public.blogs;

CREATE POLICY blogs_select_member ON public.blogs
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));

CREATE POLICY blogs_insert_editor ON public.blogs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_organization_role(organization_id, ARRAY['owner', 'admin', 'editor'])));

CREATE POLICY blogs_update_editor ON public.blogs
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_organization_role(organization_id, ARRAY['owner', 'admin', 'editor'])))
  WITH CHECK ((SELECT private.has_organization_role(organization_id, ARRAY['owner', 'admin', 'editor'])));

CREATE POLICY blogs_delete_admin ON public.blogs
  FOR DELETE TO authenticated
  USING ((SELECT private.has_organization_role(organization_id, ARRAY['owner', 'admin'])));
