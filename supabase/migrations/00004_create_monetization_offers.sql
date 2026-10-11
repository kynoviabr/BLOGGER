-- 00004_create_monetization_offers.sql
-- Módulo de Monetização da Content Factory: ofertas de produtos próprios e afiliados por categoria

CREATE TABLE IF NOT EXISTS monetization_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  offer_type TEXT NOT NULL CHECK (offer_type IN ('OWN_PRODUCT', 'AFFILIATE_CPA', 'AFFILIATE_TOOL', 'BOOK_AMAZON')),
  category_ids TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  is_global_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  pitch_hook TEXT NOT NULL,
  cta_button_text TEXT NOT NULL,
  affiliate_url TEXT NOT NULL,
  badge_text TEXT,
  priority INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para busca determinística rápida
CREATE INDEX IF NOT EXISTS idx_monetization_offers_blog_active ON monetization_offers(blog_id, is_active);
CREATE INDEX IF NOT EXISTS idx_monetization_offers_priority ON monetization_offers(priority DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_offers_category_ids ON monetization_offers USING GIN(category_ids);

-- RLS
ALTER TABLE monetization_offers ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Permitir leitura para usuários autenticados e service_role"
  ON monetization_offers FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "Permitir inserção para usuários autenticados e service_role"
  ON monetization_offers FOR INSERT
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "Permitir atualização para usuários autenticados e service_role"
  ON monetization_offers FOR UPDATE
  USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "Permitir exclusão para usuários autenticados e service_role"
  ON monetization_offers FOR DELETE
  USING (auth.role() IN ('authenticated', 'service_role'));

-- Grants
GRANT ALL ON monetization_offers TO authenticated;
GRANT ALL ON monetization_offers TO service_role;

-- Seed inicial para o blog "Universo do Dinheiro"
DO $$
DECLARE
  ud_blog_id UUID;
BEGIN
  -- Localiza o blog Universo do Dinheiro por slug ou domínio
  SELECT id INTO ud_blog_id FROM blogs WHERE slug = 'universo-do-dinheiro' OR domain LIKE '%universododinheiro%' LIMIT 1;
  
  -- Se não encontrar por slug ou domínio, pega o primeiro blog ativo
  IF ud_blog_id IS NULL THEN
    SELECT id INTO ud_blog_id FROM blogs WHERE status = 'active' LIMIT 1;
  END IF;

  IF ud_blog_id IS NOT NULL THEN
    -- Insere se ainda não existir
    IF NOT EXISTS (
      SELECT 1 FROM monetization_offers 
      WHERE blog_id = ud_blog_id AND affiliate_url = 'https://universododinheiro.com.br/ir/destrave-score'
    ) THEN
      INSERT INTO monetization_offers (
        blog_id,
        title,
        offer_type,
        category_ids,
        is_global_fallback,
        pitch_hook,
        cta_button_text,
        affiliate_url,
        badge_text,
        priority,
        is_active
      ) VALUES (
        ud_blog_id,
        'Destrave Seu Score em 30 Dias: O Método Baseado em Regulação do Banco Central (SCR) e Cadastro Positivo',
        'OWN_PRODUCT',
        ARRAY['cartoes', 'emprestimos', 'saindo-das-dividas'],
        TRUE,
        'Aprenda a auditar a caixa-preta do Banco Central (SCR/Registrato), usar as Súmulas do STJ para limpar apontamentos indevidos em 5 dias úteis e aplicar a estratégia do Banco Principal + CDB Garantido para voltar a ter crédito aprovado.',
        'Acessar o Guia Prático de 30 Dias',
        'https://universododinheiro.com.br/ir/destrave-score',
        'GUIA TÉCNICO OFICIAL',
        10,
        TRUE
      );
    END IF;
  END IF;
END $$;
