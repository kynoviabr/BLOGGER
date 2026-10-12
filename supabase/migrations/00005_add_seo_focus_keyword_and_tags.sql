-- Migration 00005: Adiciona suporte a Focus Keyword e Tags para SEO Avançado em content_items

ALTER TABLE content_items ADD COLUMN IF NOT EXISTS focus_keyword TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS idx_content_items_focus_keyword ON content_items(focus_keyword);
CREATE INDEX IF NOT EXISTS idx_content_items_tags ON content_items USING GIN(tags);

COMMENT ON COLUMN content_items.focus_keyword IS 'Palavra-chave principal de cauda longa (3-5 palavras) otimizada para SEO e E-E-A-T.';
COMMENT ON COLUMN content_items.tags IS 'Tags temáticas do artigo sincronizadas dinamicamente com as tags do WordPress.';
