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
  content: string; // HTML ou Markdown renderizado
  excerpt?: string;
  status: 'publish' | 'draft' | 'pending' | 'future';
  scheduledDate?: string; // ISO 8601
  categories?: number[]; // IDs das categorias no CMS remoto
  tags?: number[];
  featuredMediaId?: string | number;
  authorId?: number;
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
}
