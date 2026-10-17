import { cookies } from "next/headers";
import { PageHeader } from "@/components/shared/page-header";
import { MonetizationService } from "@/services/monetization";
import { BlogService } from "@/services/blog.service";
import { OffersList } from "@/components/monetization/offers-list";
import { MonetizationOffer } from "@/types/monetization";
import { BlogWithRelations } from "@/types/blog";

export const dynamic = "force-dynamic";

export default async function MonetizationPage({
  searchParams,
}: {
  searchParams: Promise<{ blogId?: string }>;
}) {
  const { blogId: queryBlogId } = await searchParams;
  const cookieStore = await cookies();
  const cookieBlogId = cookieStore.get("selected_blog_id")?.value;

  const rawBlogId = queryBlogId !== undefined ? queryBlogId : cookieBlogId;
  const blogId = rawBlogId && rawBlogId !== "all" ? rawBlogId : undefined;

  let offers: MonetizationOffer[] = [];
  let blogs: BlogWithRelations[] = [];
  let errorMsg: string | null = null;

  try {
    [offers, blogs] = await Promise.all([
      MonetizationService.listOffers(blogId),
      BlogService.listBlogs(),
    ]);
  } catch (err) {
    errorMsg =
      err instanceof Error
        ? err.message
        : "Erro ao carregar dados do módulo de monetização.";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Motor de Monetização & Afiliados"
        description="Vincule ofertas de Produtos Próprios (e-books, mentorias) e Links de Afiliados diretamente às categorias dos seus blogs. Injeção determinística de boxes HTML de alta conversão sem depender de adivinhações da IA."
      />

      {errorMsg ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200">
            <h4 className="font-semibold text-sm mb-1">Tabela de Monetização Pendente no Supabase</h4>
            <p className="mb-2">
              A tabela <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">monetization_offers</code> ainda não foi criada no banco de dados do Supabase. Para ativá-la com o seed inicial, execute o script SQL abaixo no <strong>SQL Editor do Supabase</strong>:
            </p>
            <pre className="p-3 bg-slate-900 text-slate-100 rounded text-[11px] overflow-x-auto max-h-64 font-mono">
{`-- Cole e execute no Supabase SQL Editor:
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

CREATE INDEX IF NOT EXISTS idx_monetization_offers_blog_active ON monetization_offers(blog_id, is_active);
CREATE INDEX IF NOT EXISTS idx_monetization_offers_priority ON monetization_offers(priority DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_offers_category_ids ON monetization_offers USING GIN(category_ids);

ALTER TABLE monetization_offers ENABLE ROW LEVEL SECURITY;

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

GRANT ALL ON monetization_offers TO authenticated;
GRANT ALL ON monetization_offers TO service_role;

-- Seed inicial para o blog Universo do Dinheiro
DO $$
DECLARE
  ud_blog_id UUID;
BEGIN
  SELECT id INTO ud_blog_id FROM blogs WHERE slug = 'universo-do-dinheiro' OR domain LIKE '%universododinheiro%' LIMIT 1;
  IF ud_blog_id IS NULL THEN
    SELECT id INTO ud_blog_id FROM blogs WHERE status = 'active' LIMIT 1;
  END IF;

  IF ud_blog_id IS NOT NULL THEN
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
END $$;`}
            </pre>
          </div>
        </div>
      ) : (
        <OffersList initialOffers={offers} blogs={blogs} defaultBlogId={blogId} />
      )}
    </div>
  );
}
