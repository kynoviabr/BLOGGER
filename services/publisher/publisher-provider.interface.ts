export interface MediaUploadInput {
  fileName: string;
  mimeType: string;
  data: Buffer | Blob | Uint8Array;
  altText?: string;
  title?: string;
  caption?: string;
}

export interface MediaUploadResult {
  mediaId: string | number;
  sourceUrl: string;
  title?: string;
  altText?: string;
}

export interface ArticlePublishInput {
  title: string;
  slug?: string;
  content: string; // HTML renderizado ou Markdown sanitizado
  excerpt?: string;
  language?: string;
  status: 'publish' | 'draft' | 'pending' | 'future';
  scheduledDate?: string; // ISO 8601
  categorySlug?: string; // Slug oficial da categoria para resolução dinâmica obrigatória
  categories?: number[]; // IDs numéricos das categorias no CMS remoto
  categoryNames?: string[]; // Nomes de categorias legadas para fallback
  metaTitle?: string;
  metaDescription?: string;
  primaryKeyword?: string;
  tags?: number[];
  featuredMediaId?: string | number;
  authorId?: number;
  dryRun?: boolean;
}

export interface PublishResult {
  success: boolean;
  postId: string | number;
  url: string;
  status: string;
  publishedAt: string;
  provider: string;
}

export interface PublisherProvider {
  readonly name: string;

  /**
   * Faz upload de mídia/imagem para a biblioteca remota do WordPress/CMS.
   */
  uploadMedia(media: MediaUploadInput): Promise<MediaUploadResult>;

  /**
   * Publica ou agenda um artigo no WordPress/CMS remoto.
   */
  publishArticle(article: ArticlePublishInput): Promise<PublishResult>;

  /**
   * Resolve ou cria uma categoria no CMS remoto e retorna seu ID numérico.
   */
  resolveCategory?(nameOrSlug: string): Promise<number | null>;
}
