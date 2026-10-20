-- Phase 3B: auditable, expiring organization invitations.
CREATE TABLE public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 320),
  role varchar(20) NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  token_hash text NOT NULL UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_pending_organization_invitation_email
  ON public.organization_invitations (organization_id, lower(email))
  WHERE status = 'pending';
CREATE INDEX idx_organization_invitations_org_status
  ON public.organization_invitations (organization_id, status, created_at DESC);
CREATE INDEX idx_organization_invitations_expiry
  ON public.organization_invitations (expires_at)
  WHERE status = 'pending';

CREATE TRIGGER update_organization_invitations_updated_at
  BEFORE UPDATE ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_invitations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organization_invitations TO service_role;

CREATE POLICY organization_invitations_select_manager
  ON public.organization_invitations FOR SELECT TO authenticated
  USING ((SELECT private.has_organization_role(organization_id, ARRAY['owner', 'admin'])));

CREATE POLICY organization_invitations_insert_manager
  ON public.organization_invitations FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = (SELECT auth.uid())
    AND status = 'pending'
    AND (
      (SELECT private.has_organization_role(organization_id, ARRAY['owner']))
      OR (
        role IN ('editor', 'viewer')
        AND (SELECT private.has_organization_role(organization_id, ARRAY['admin']))
      )
    )
  );

CREATE POLICY organization_invitations_update_manager
  ON public.organization_invitations FOR UPDATE TO authenticated
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

CREATE POLICY organization_invitations_delete_manager
  ON public.organization_invitations FOR DELETE TO authenticated
  USING (
    (SELECT private.has_organization_role(organization_id, ARRAY['owner']))
    OR (
      role IN ('editor', 'viewer')
      AND (SELECT private.has_organization_role(organization_id, ARRAY['admin']))
    )
  );

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(raw_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := (SELECT auth.uid());
  current_email text;
  invitation public.organization_invitations%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT lower(email) INTO current_email
  FROM auth.users
  WHERE id = current_user_id;

  SELECT * INTO invitation
  FROM public.organization_invitations
  WHERE token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
    AND status = 'pending'
  FOR UPDATE;

  IF invitation.id IS NULL THEN
    RAISE EXCEPTION 'invitation not found or already used';
  END IF;
  IF invitation.expires_at <= now() THEN
    UPDATE public.organization_invitations SET status = 'expired' WHERE id = invitation.id;
    RAISE EXCEPTION 'invitation expired';
  END IF;
  IF lower(invitation.email) <> current_email THEN
    RAISE EXCEPTION 'invitation email does not match authenticated user';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = invitation.organization_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'organization is not active';
  END IF;

  INSERT INTO public.organization_members (
    organization_id, user_id, role, status, invited_by, joined_at
  ) VALUES (
    invitation.organization_id, current_user_id, invitation.role, 'active',
    invitation.invited_by, now()
  )
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    invited_by = EXCLUDED.invited_by,
    joined_at = now(),
    updated_at = now();

  UPDATE public.organization_invitations
  SET status = 'accepted', accepted_by = current_user_id, accepted_at = now()
  WHERE id = invitation.id;

  RETURN invitation.organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_organization_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(text) TO authenticated, service_role;
