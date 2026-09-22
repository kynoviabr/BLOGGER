-- ==============================================================================
-- CONTENT FACTORY - SCHEMA DE BANCO DE DADOS (FASE 01 - FOUNDATION)
-- ==============================================================================

-- Habilita extensão para geração de UUID se necessário
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Função trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. TABELA: blogs
CREATE TABLE IF NOT EXISTS blogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,
    domain VARCHAR(255) NOT NULL,
    description TEXT,
    niche VARCHAR(100) NOT NULL,
    audience TEXT,
    default_language VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    theme_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    editorial_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    seo_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    monetization_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_blogs_updated_at
    BEFORE UPDATE ON blogs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. TABELA: blog_languages
CREATE TABLE IF NOT EXISTS blog_languages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    language VARCHAR(10) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_blog_language UNIQUE (blog_id, language)
);

-- 3. TABELA: categories
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_blog_category_slug UNIQUE (blog_id, slug)
);

CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. TABELA: editorial_calendar
CREATE TABLE IF NOT EXISTS editorial_calendar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    topic TEXT NOT NULL,
    proposed_title TEXT NOT NULL,
    keywords TEXT[] NOT NULL DEFAULT '{}',
    article_type VARCHAR(50) NOT NULL DEFAULT 'standard',
    scheduled_at TIMESTAMPTZ,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    status VARCHAR(20) NOT NULL DEFAULT 'IDEA' CHECK (status IN ('IDEA', 'PLANNED', 'IN_PROGRESS', 'READY', 'SCHEDULED', 'PUBLISHED', 'FAILED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_editorial_calendar_updated_at
    BEFORE UPDATE ON editorial_calendar
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. TABELA: media_assets (criada antes de content_items para suportar featured_image_id)
CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    content_id UUID, -- FK adicionada após a criação de content_items
    type VARCHAR(30) NOT NULL DEFAULT 'image' CHECK (type IN ('image', 'video', 'infographic')),
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    alt_text TEXT,
    prompt TEXT,
    provider VARCHAR(50) NOT NULL DEFAULT 'gemini',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. TABELA: content_items
CREATE TABLE IF NOT EXISTS content_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    editorial_calendar_id UUID REFERENCES editorial_calendar(id) ON DELETE SET NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    title VARCHAR(300) NOT NULL,
    slug VARCHAR(350) NOT NULL,
    excerpt TEXT,
    body TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewing', 'ready', 'scheduled', 'published', 'archived')),
    seo_title VARCHAR(150),
    meta_description VARCHAR(300),
    featured_image_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_blog_content_slug UNIQUE (blog_id, slug)
);

CREATE TRIGGER update_content_items_updated_at
    BEFORE UPDATE ON content_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Adiciona a FK circular de media_assets -> content_items
ALTER TABLE media_assets
    ADD CONSTRAINT fk_media_content
    FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE SET NULL;

-- 7. TABELA: content_sources
CREATE TABLE IF NOT EXISTS content_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    source_type VARCHAR(50) NOT NULL DEFAULT 'web_page',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. TABELA: ai_runs
CREATE TABLE IF NOT EXISTS ai_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
    agent VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    input_summary TEXT,
    output_summary TEXT,
    estimated_cost NUMERIC(10, 6) DEFAULT 0.000000,
    duration_ms INTEGER DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. TABELA: system_logs
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level VARCHAR(10) NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
    service VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- ÍNDICES DE PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs(slug);
CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status);

CREATE INDEX IF NOT EXISTS idx_categories_blog_id ON categories(blog_id);

CREATE INDEX IF NOT EXISTS idx_calendar_blog_id ON editorial_calendar(blog_id);
CREATE INDEX IF NOT EXISTS idx_calendar_status ON editorial_calendar(status);
CREATE INDEX IF NOT EXISTS idx_calendar_scheduled_at ON editorial_calendar(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_content_blog_id ON content_items(blog_id);
CREATE INDEX IF NOT EXISTS idx_content_status ON content_items(status);
CREATE INDEX IF NOT EXISTS idx_content_calendar_id ON content_items(editorial_calendar_id);
CREATE INDEX IF NOT EXISTS idx_content_slug ON content_items(slug);

CREATE INDEX IF NOT EXISTS idx_media_blog_id ON media_assets(blog_id);
CREATE INDEX IF NOT EXISTS idx_media_content_id ON media_assets(content_id);

CREATE INDEX IF NOT EXISTS idx_sources_content_id ON content_sources(content_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_content_id ON ai_runs(content_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_status ON ai_runs(status);

CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_service ON system_logs(service);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) - PRIVADO E RESTRITO (PROMPT 01.1 HARDENING)
-- ==============================================================================
ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Revogar qualquer privilégio público/anon
REVOKE ALL ON blogs FROM anon;
REVOKE ALL ON blog_languages FROM anon;
REVOKE ALL ON categories FROM anon;
REVOKE ALL ON editorial_calendar FROM anon;
REVOKE ALL ON media_assets FROM anon;
REVOKE ALL ON content_items FROM anon;
REVOKE ALL ON content_sources FROM anon;
REVOKE ALL ON ai_runs FROM anon;
REVOKE ALL ON system_logs FROM anon;

-- Conceder privilégios apenas a authenticated e service_role
GRANT ALL ON blogs TO authenticated, service_role;
GRANT ALL ON blog_languages TO authenticated, service_role;
GRANT ALL ON categories TO authenticated, service_role;
GRANT ALL ON editorial_calendar TO authenticated, service_role;
GRANT ALL ON media_assets TO authenticated, service_role;
GRANT ALL ON content_items TO authenticated, service_role;
GRANT ALL ON content_sources TO authenticated, service_role;
GRANT ALL ON ai_runs TO authenticated, service_role;
GRANT ALL ON system_logs TO authenticated, service_role;

-- 1. Policies para AUTHENTICATED (Usuário logado no painel)
CREATE POLICY "authenticated_all_blogs" ON blogs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_blog_languages" ON blog_languages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_categories" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_editorial_calendar" ON editorial_calendar FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_content_items" ON content_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_content_sources" ON content_sources FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_media_assets" ON media_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_ai_runs" ON ai_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_system_logs" ON system_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Policies para SERVICE_ROLE (Workers backend e processos administrativos)
CREATE POLICY "service_role_all_blogs" ON blogs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_blog_languages" ON blog_languages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_categories" ON categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_editorial_calendar" ON editorial_calendar FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_content_items" ON content_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_content_sources" ON content_sources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_media_assets" ON media_assets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_ai_runs" ON ai_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_system_logs" ON system_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
