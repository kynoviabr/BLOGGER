import {
  PublisherProvider,
  MediaUploadInput,
  MediaUploadResult,
  ArticlePublishInput,
  PublishResult,
} from './publisher-provider.interface';
import { logger } from '@/lib/logger';

export class MockPublisherProvider implements PublisherProvider {
  readonly name = 'MockPublisherProvider';

  async uploadMedia(media: MediaUploadInput): Promise<MediaUploadResult> {
    logger.info(this.name, `Upload simulado de mídia: ${media.fileName}`);
    return {
      mediaId: Math.floor(Math.random() * 100000),
      sourceUrl: `https://example.com/wp-content/uploads/mock-${Date.now()}-${media.fileName}`,
      title: media.title || media.fileName,
      altText: media.altText,
    };
  }

  async publishArticle(article: ArticlePublishInput): Promise<PublishResult> {
    logger.info(this.name, `Publicação simulada de post: "${article.title}"`, {
      status: article.status,
      featuredMedia: article.featuredMediaId,
    });

    const postId = Math.floor(Math.random() * 100000);
    return {
      success: true,
      postId,
      url: `https://example.com/artigos/${article.slug || `post-${postId}`}`,
      status: article.status,
      publishedAt: article.scheduledDate || new Date().toISOString(),
      provider: this.name,
    };
  }

  async getPostBySlug(slug: string): Promise<{ id: number; link: string } | null> {
    return {
      id: Math.floor(Math.random() * 100000),
      link: `https://example.com/artigos/${slug}`,
    };
  }

  async updatePostContent(postId: number, content: string): Promise<boolean> {
    logger.info(this.name, `Atualização simulada de conteúdo do post ${postId} (tamanho: ${content.length} chars)`);
    return true;
  }
}
