-- Fix security-advisor findings without changing application-visible behavior.

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = pg_catalog, public;

-- This event-trigger helper is administrative infrastructure and must not be
-- exposed as an RPC through the Data API.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
