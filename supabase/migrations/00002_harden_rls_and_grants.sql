-- ==============================================================================
-- CONTENT FACTORY - HARDENING DE RLS E PERMISSÕES (PROMPT 01.1)
-- ==============================================================================

-- 1. REVOGAR QUALQUER ACESSO DO ROLE 'anon' ÀS TABELAS ADMINISTRATIVAS
REVOKE ALL ON blogs FROM anon;
REVOKE ALL ON blog_languages FROM anon;
REVOKE ALL ON categories FROM anon;
REVOKE ALL ON editorial_calendar FROM anon;
REVOKE ALL ON media_assets FROM anon;
REVOKE ALL ON content_items FROM anon;
REVOKE ALL ON content_sources FROM anon;
REVOKE ALL ON ai_runs FROM anon;
REVOKE ALL ON system_logs FROM anon;

-- 2. ASSEGURAR GRANTS NECESSÁRIOS PARA 'authenticated' E 'service_role'
GRANT ALL ON blogs TO authenticated, service_role;
GRANT ALL ON blog_languages TO authenticated, service_role;
GRANT ALL ON categories TO authenticated, service_role;
GRANT ALL ON editorial_calendar TO authenticated, service_role;
GRANT ALL ON media_assets TO authenticated, service_role;
GRANT ALL ON content_items TO authenticated, service_role;
GRANT ALL ON content_sources TO authenticated, service_role;
GRANT ALL ON ai_runs TO authenticated, service_role;
GRANT ALL ON system_logs TO authenticated, service_role;

-- 3. REMOVER POLICIES PERMISSIVAS ANTERIORES QUE NÃO ESPECIFICAVAM 'TO'
DROP POLICY IF EXISTS "Full access to service role for blogs" ON blogs;
DROP POLICY IF EXISTS "Full access to service role for blog_languages" ON blog_languages;
DROP POLICY IF EXISTS "Full access to service role for categories" ON categories;
DROP POLICY IF EXISTS "Full access to service role for editorial_calendar" ON editorial_calendar;
DROP POLICY IF EXISTS "Full access to service role for content_items" ON content_items;
DROP POLICY IF EXISTS "Full access to service role for content_sources" ON content_sources;
DROP POLICY IF EXISTS "Full access to service role for media_assets" ON media_assets;
DROP POLICY IF EXISTS "Full access to service role for ai_runs" ON ai_runs;
DROP POLICY IF EXISTS "Full access to service role for system_logs" ON system_logs;

-- 4. FORÇAR RLS ATIVO EM TODAS AS TABELAS
ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- 5. POLICIES ESTRITAS PARA USUÁRIOS AUTENTICADOS (authenticated)
-- Na fase single-user, qualquer usuário autenticado no Supabase Auth tem controle total da administração.
CREATE POLICY "allow_authenticated_all_blogs" ON blogs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_all_blog_languages" ON blog_languages
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_all_categories" ON categories
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_all_editorial_calendar" ON editorial_calendar
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_all_content_items" ON content_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_all_content_sources" ON content_sources
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_all_media_assets" ON media_assets
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_all_ai_runs" ON ai_runs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_all_system_logs" ON system_logs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. POLICIES ESTRITAS PARA SERVICE ROLE (service_role)
-- Operações server-side / workers em background
CREATE POLICY "allow_service_role_all_blogs" ON blogs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_service_role_all_blog_languages" ON blog_languages
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_service_role_all_categories" ON categories
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_service_role_all_editorial_calendar" ON editorial_calendar
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_service_role_all_content_items" ON content_items
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_service_role_all_content_sources" ON content_sources
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_service_role_all_media_assets" ON media_assets
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_service_role_all_ai_runs" ON ai_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_service_role_all_system_logs" ON system_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
