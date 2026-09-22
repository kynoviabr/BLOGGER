import {
  PublisherProvider,
  MediaUploadInput,
  MediaUploadResult,
  ArticlePublishInput,
  PublishResult,
} from './publisher-provider.interface';
import { PublishingError } from '@/lib/errors/publisher.errors';
import { logger } from '@/lib/logger';

export interface WordPressConfig {
  siteUrl?: string; // ex: https://meublog.com
  username?: string; // ex: admin
  applicationPassword?: string; // ex: abcd 1234 efgh 5678
  timeoutMs?: number;
}

export class WordPressProvider implements PublisherProvider {
  readonly name = 'WordPressProvider';
  private readonly siteUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;

  constructor(config: WordPressConfig = {}) {
    const siteUrl = config.siteUrl || process.env.WORDPRESS_SITE_URL || '';
    const username = config.username || process.env.WORDPRESS_USERNAME || '';
    const appPassword =
      config.applicationPassword ||
      process.env.WORDPRESS_APPLICATION_PASSWORD ||
      '';

    if (!siteUrl || !username || !appPassword) {
      throw new PublishingError(
        'Configurações do WordPress incompletas (siteUrl, username ou applicationPassword ausentes).',
        { provider: this.name, statusCode: 401, isRetryable: false }
      );
    }

    // Normaliza a URL removendo trailing slash
    this.siteUrl = siteUrl.replace(/\/+$/, '');
    this.authHeader = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
    this.timeoutMs = config.timeoutMs || 45000;
  }

  /**
   * Upload de imagem/mídia para o WordPress via /wp-json/wp/v2/media
   */
  async uploadMedia(media: MediaUploadInput): Promise<MediaUploadResult> {
    const endpoint = `${this.siteUrl}/wp-json/wp/v2/media`;

    logger.info(this.name, `Iniciando upload de mídia: ${media.fileName}`, {
      mimeType: media.mimeType,
      endpoint,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(media.fileName)}"`,
          'Content-Type': media.mimeType,
          Accept: 'application/json',
        },
        body: media.data instanceof Buffer ? (media.data as unknown as BodyInit) : (media.data as BodyInit),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        const message = errorJson.message || response.statusText;
        const isRetryable = response.status >= 500 || response.status === 429;

        throw new PublishingError(
          `Falha no upload de mídia no WordPress: [${response.status}] ${message}`,
          {
            provider: this.name,
            statusCode: response.status,
            isRetryable,
            originalError: errorJson,
          }
        );
      }

      const createdMedia = await response.json();

      // Atualiza alt_text e caption se fornecidos
      if (media.altText || media.caption || media.title) {
        try {
          await fetch(`${endpoint}/${createdMedia.id}`, {
            method: 'POST',
            headers: {
              Authorization: this.authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              alt_text: media.altText || '',
              caption: media.caption || '',
              title: media.title || media.fileName,
            }),
          });
        } catch (updateErr) {
          logger.warn(this.name, `Mídia criada mas falha ao atualizar alt_text: ${String(updateErr)}`);
        }
      }

      logger.info(this.name, `Upload de mídia concluído com sucesso`, {
        mediaId: createdMedia.id,
        sourceUrl: createdMedia.source_url,
      });

      return {
        mediaId: createdMedia.id,
        sourceUrl: createdMedia.source_url,
        title: createdMedia.title?.rendered || media.fileName,
        altText: media.altText,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof PublishingError) {
        throw err;
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      const isTimeout = errorMessage.toLowerCase().includes('abort') || errorMessage.toLowerCase().includes('timeout');

      logger.error(this.name, `Erro de rede/upload WordPress: ${errorMessage}`, { error: err });

      throw new PublishingError(
        isTimeout ? `Timeout ao enviar mídia após ${this.timeoutMs}ms.` : errorMessage,
        {
          provider: this.name,
          statusCode: isTimeout ? 504 : 500,
          isRetryable: isTimeout,
          originalError: err,
        }
      );
    }
  }

  /**
   * Cria ou agenda um post no WordPress via /wp-json/wp/v2/posts
   */
  async publishArticle(article: ArticlePublishInput): Promise<PublishResult> {
    const endpoint = `${this.siteUrl}/wp-json/wp/v2/posts`;

    logger.info(this.name, `Iniciando publicação de post: "${article.title}"`, {
      status: article.status,
      hasFeaturedMedia: !!article.featuredMediaId,
      categories: article.categories,
    });

    const payload: Record<string, unknown> = {
      title: article.title,
      content: article.content,
      status: article.status,
    };

    if (article.slug) {
      payload.slug = article.slug;
    }

    if (article.excerpt) {
      payload.excerpt = article.excerpt;
    }

    if (article.scheduledDate) {
      payload.date = article.scheduledDate;
    }

    if (article.categories && article.categories.length > 0) {
      payload.categories = article.categories;
    }

    if (article.tags && article.tags.length > 0) {
      payload.tags = article.tags;
    }

    if (article.featuredMediaId) {
      payload.featured_media = Number(article.featuredMediaId);
    }

    if (article.authorId) {
      payload.author = article.authorId;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        const message = errorJson.message || response.statusText;
        const isRetryable = response.status >= 500 || response.status === 429;

        throw new PublishingError(
          `Falha ao publicar post no WordPress: [${response.status}] ${message}`,
          {
            provider: this.name,
            statusCode: response.status,
            isRetryable,
            originalError: errorJson,
          }
        );
      }

      const postData = await response.json();

      logger.info(this.name, `Post publicado/agendado com sucesso no WordPress`, {
        postId: postData.id,
        link: postData.link,
        status: postData.status,
      });

      return {
        success: true,
        postId: postData.id,
        url: postData.link,
        status: postData.status,
        publishedAt: postData.date,
        provider: this.name,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof PublishingError) {
        throw err;
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      const isTimeout = errorMessage.toLowerCase().includes('abort') || errorMessage.toLowerCase().includes('timeout');

      logger.error(this.name, `Erro de conexão com WordPress: ${errorMessage}`, { error: err });

      throw new PublishingError(
        isTimeout ? `Timeout ao comunicar com WordPress após ${this.timeoutMs}ms.` : errorMessage,
        {
          provider: this.name,
          statusCode: isTimeout ? 504 : 500,
          isRetryable: isTimeout,
          originalError: err,
        }
      );
    }
  }
}
