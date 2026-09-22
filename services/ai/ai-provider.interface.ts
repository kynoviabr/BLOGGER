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
}
