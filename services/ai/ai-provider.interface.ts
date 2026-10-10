/**
 * ARQUITETURA DO PIPELINE EDITORIAL:
 * IDEA -> RESEARCH / FACTUAL CONTEXT (future) -> ARTICLE -> QUALITY GATE -> IMAGE -> PUBLISH
 *
 * 1. IDEA: Geração unitária e resiliente da pauta com intenção de busca, CTR e diversidade.
 * 2. RESEARCH / FACTUAL CONTEXT: Injeção de fontes atualizadas, regras e dados vigentes (campo sourcesOrResearch).
 * 3. ARTICLE: Redação editorial profunda, sem muletas de IA, cumprindo target word count.
 * 4. QUALITY GATE: Validação real de word count, anacronismos temporais, pt-BR e metadados.
 * 5. IMAGE: Geração de imagem via OpenAI (DALL-E 3) com otimização JPEG/MozJPEG.
 * 6. PUBLISH: Publicação no WordPress com featured_media e metadados SEO.
 */

export interface GeneratedArticle {
  title: string;
  slug: string;
  metaDescription: string;
  content: string; // Markdown limpo ou HTML
  keywords: string[];
  readingTimeMinutes?: number;
}

export interface ArticleGenerationContext {
  niche?: string;
  audience?: string;
  language?: string;
  tone?: string;
  category?: string;
  notes?: string;
  currentDate?: string;
  /**
   * Fontes factuais, contexto regulatório ou pesquisas atualizadas fornecidas externamente.
   * Quando presente, tem prioridade máxima sobre o conhecimento interno do modelo.
   */
  sourcesOrResearch?: string;
  [key: string]: unknown;
}

export interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;
  readonly fallbackModel?: string;

  /**
   * Gera um artigo completo otimizado para SEO baseado em tema, palavras-chave e contexto do blog.
   */
  generateArticle(
    title: string,
    keywords: string[],
    context?: ArticleGenerationContext
  ): Promise<GeneratedArticle>;

  /**
   * Gera ideias de pautas estruturadas em lote para um blog e nicho específico.
   */
  generateIdeas?(
    context: {
      niche?: string;
      audience?: string;
      purpose?: string;
      category?: string;
      language?: string;
      count?: number;
    }
  ): Promise<Array<{ title: string; keywords: string; description: string; type: string }>>;

  /**
   * Gera EXATAMENTE UMA ideia de pauta estruturada com prevenção de duplicidades.
   */
  generateIdea?(
    context: {
      niche?: string;
      audience?: string;
      purpose?: string;
      category?: string;
      availableCategories?: string[];
      language?: string;
      blogName?: string;
      currentDate?: string;
      existingIdeas?: Array<{ title: string; keywords?: string; type?: string }>;
      queuePosition?: number;
      totalRequested?: number;
    }
  ): Promise<{ title: string; keywords: string; description: string; type: string; category?: string }>;
}
