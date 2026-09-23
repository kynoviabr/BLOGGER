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
  [key: string]: unknown;
}

export interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;

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
}
