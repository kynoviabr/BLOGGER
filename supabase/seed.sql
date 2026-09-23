-- ==============================================================================
-- CONTENT FACTORY - SEED DE TESTE INICIAL (FASE 01 - FOUNDATION)
-- ==============================================================================

-- 1. Inserir Blog de Teste Principal
INSERT INTO blogs (
    id,
    name,
    slug,
    domain,
    description,
    niche,
    audience,
    default_language,
    status,
    theme_config,
    editorial_config,
    seo_config,
    monetization_config
) VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Tech & AI Insights',
    'tech-ai-insights',
    'tech-ai-insights.com',
    'Blog especializado em automação, inteligência artificial avançada e engenharia de software moderna.',
    'Tecnologia & IA',
    'Desenvolvedores, líderes técnicos e entusiastas de automação',
    'pt-BR',
    'active',
    '{"primary_color": "#2563eb", "font_family": "Inter", "dark_mode": true}'::jsonb,
    '{"tone": "autoritário, prático e detalhado", "min_words": 1500, "max_words": 3000, "include_code_examples": true}'::jsonb,
    '{"author_name": "Content Factory AI", "meta_suffix": " | Tech & AI Insights", "sitemap_enabled": true}'::jsonb,
    '{"affiliate_links": true, "ad_slots": ["top-banner", "in-content-2", "bottom-cta"]}'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- 2. Inserir Idiomas do Blog
INSERT INTO blog_languages (id, blog_id, language, active) VALUES
    ('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'pt-BR', true),
    ('b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'en-US', true)
ON CONFLICT DO NOTHING;

-- 3. Inserir Categorias do Blog
INSERT INTO categories (id, blog_id, name, slug, description) VALUES
    ('c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a31', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Inteligência Artificial', 'inteligencia-artificial', 'Novidades e guias sobre LLMs, agentes e automação cognitiva.'),
    ('c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a32', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Engenharia de Software', 'engenharia-de-software', 'Arquitetura moderna, Next.js, bancos vetoriais e boas práticas.'),
    ('c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'SEO & Distribuição', 'seo-distribuicao', 'Estratégias de rankeamento no Google, AIO e tráfego orgânico.')
ON CONFLICT DO NOTHING;

-- 4. Inserir Itens no Calendário Editorial
INSERT INTO editorial_calendar (
    id,
    blog_id,
    category_id,
    language,
    topic,
    proposed_title,
    keywords,
    article_type,
    scheduled_at,
    priority,
    status,
    notes
) VALUES
    (
        'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a41',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a31',
        'pt-BR',
        'Impacto dos Agentes de IA Autônomos na Criação de Conteúdo em 2026',
        'Como Agentes de IA Autônomos Revolucionaram a Produção Editorial',
        ARRAY['agentes de ia', 'automacao de conteudo', 'inteligencia artificial 2026'],
        'deep_dive',
        NOW() + INTERVAL '2 days',
        'high',
        'PLANNED',
        'Focar em fluxos orquestrados com verificação de fatos e geração de mídia.'
    ),
    (
        'd2eebc99-9c0b-4ef8-bb6d-6bb9bd380a42',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a32',
        'pt-BR',
        'Arquitetura de Microsserviços e Next.js App Router para Portais de Notícia',
        'Guia Completo de Arquitetura Next.js para Blogs de Alto Desempenho',
        ARRAY['nextjs', 'arquitetura web', 'core web vitals'],
        'tutorial',
        NOW() + INTERVAL '5 days',
        'medium',
        'IDEA',
        'Incluir benchmark de LCP e SSR vs ISR.'
    ),
    (
        'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a43',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
        'pt-BR',
        'Otimização para Mecanismos de Resposta Generativa (AIO & GEO)',
        'SEO em 2026: Como Posicionar Seu Conteúdo nos Motores de Busca com IA',
        ARRAY['seo 2026', 'generative engine optimization', 'aio'],
        'guide',
        NOW() - INTERVAL '1 day',
        'high',
        'PUBLISHED',
        'Artigo publicado com sucesso no blog piloto.'
    )
ON CONFLICT DO NOTHING;

-- 5. Inserir Mídia de Teste
INSERT INTO media_assets (
    id,
    blog_id,
    type,
    storage_path,
    public_url,
    alt_text,
    prompt,
    provider
) VALUES (
    'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a51',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'image',
    'blogs/tech-ai-insights/seo-2026-hero.webp',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
    'Rede neural futurista representando inteligência artificial e busca de dados',
    'Futuristic high tech network connecting search queries with AI neural graphs, cinematic lighting, 8k',
    'gemini'
) ON CONFLICT DO NOTHING;

-- 6. Inserir Conteúdo Publicado de Teste
INSERT INTO content_items (
    id,
    blog_id,
    editorial_calendar_id,
    language,
    title,
    slug,
    excerpt,
    body,
    status,
    seo_title,
    meta_description,
    featured_image_id,
    published_at
) VALUES (
    'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a61',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a43',
    'pt-BR',
    'SEO em 2026: Como Posicionar Seu Conteúdo nos Motores de Busca com IA',
    'seo-em-2026-como-posicionar-conteudo-motores-busca-ia',
    'Descubra como os motores de busca alimentados por IA selecionam e citam fontes de autoridade no cenário moderno de AIO e GEO.',
    '## Introdução\n\nA ascensão dos motores de busca generativos transformou a forma como as informações são indexadas e apresentadas aos usuários.\n\n### O que é Generative Engine Optimization (GEO)?\n\nGEO refere-se ao conjunto de técnicas voltadas para fazer com que os modelos de IA entendam a autoridade e pertinência dos seus dados para citá-los como fonte primária.\n\n### Conclusão\n\nConstruir conteúdo orientado a dados reais e resolver problemas práticos continua sendo o melhor caminho.',
    'published',
    'SEO em 2026: Guia de Otimização para Motores Generativos | Tech & AI',
    'Aprenda como estruturar seu conteúdo para ser referenciado por motores de busca com IA em 2026.',
    'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a51',
    NOW() - INTERVAL '1 day'
) ON CONFLICT DO NOTHING;

-- Atualizar FK de media_assets para apontar para o content_item
UPDATE media_assets
SET content_id = 'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a61'
WHERE id = 'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a51';

-- 7. Inserir Fontes de Conteúdo
INSERT INTO content_sources (
    id,
    content_id,
    title,
    url,
    source_type,
    notes
) VALUES (
    '71eebc99-9c0b-4ef8-bb6d-6bb9bd380a71',
    'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a61',
    'Estudo sobre GEO e Citações em Motores de Resposta',
    'https://arxiv.org/abs/2311.09735',
    'research_paper',
    'Pesquisa pioneira sobre GEO.'
) ON CONFLICT DO NOTHING;

-- 8. Inserir AI Run de Demonstração
INSERT INTO ai_runs (
    id,
    content_id,
    agent,
    provider,
    model,
    status,
    input_summary,
    output_summary,
    estimated_cost,
    duration_ms,
    created_at
) VALUES (
    '81eebc99-9c0b-4ef8-bb6d-6bb9bd380a81',
    'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a61',
    'WriterAgent',
    'gemini',
    'gemini-3.6-flash',
    'completed',
    'Prompt editorial com pauta "SEO em 2026", tom autoritário e palavras-chave específicas.',
    'Artigo gerado com 1.650 palavras, 4 seções principais e metadados SEO.',
    0.002400,
    3420,
    NOW() - INTERVAL '1 day'
) ON CONFLICT DO NOTHING;

-- 9. Inserir Logs de Inicialização
INSERT INTO system_logs (id, level, service, message, metadata, created_at) VALUES
    ('91eebc99-9c0b-4ef8-bb6d-6bb9bd380a91', 'info', 'SystemInitializer', 'Banco de dados inicializado com sucesso via migrations.', '{"version": "1.0.0", "phase": "foundation"}'::jsonb, NOW() - INTERVAL '2 hours'),
    ('92eebc99-9c0b-4ef8-bb6d-6bb9bd380a92', 'info', 'BlogManager', 'Blog de teste "Tech & AI Insights" criado com sucesso.', '{"blog_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"}'::jsonb, NOW() - INTERVAL '2 hours'),
    ('93eebc99-9c0b-4ef8-bb6d-6bb9bd380a93', 'info', 'EditorialCalendar', 'Pautas iniciais agendadas para o blog piloto.', '{"count": 3}'::jsonb, NOW() - INTERVAL '1 hour'),
    ('94eebc99-9c0b-4ef8-bb6d-6bb9bd380a94', 'debug', 'WorkerRegistry', 'Contratos de background workers registrados em memória.', '{"workers": ["content-worker", "image-worker", "publishing-worker"]}'::jsonb, NOW() - INTERVAL '30 minutes');
