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

import { MonetizationOffer } from '@/types/monetization';

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
  focusKeyword?: string;
  tags?: number[];
  tagNames?: string[];
  featuredMediaId?: string | number;
  authorId?: number;
  dryRun?: boolean;
  offers?: MonetizationOffer[];
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

  /**
   * Resolve ou cria tags no CMS remoto e retorna seus IDs numéricos.
   */
  resolveTagIds?(tagNames: string[]): Promise<number[]>;

  /**
   * Localiza um post no CMS pelo slug.
   */
  getPostBySlug?(slug: string): Promise<{ id: number; link: string } | null>;

  /**
   * Atualiza o conteúdo HTML de um post já existente.
   */
  updatePostContent?(postId: number, content: string): Promise<boolean>;
}
