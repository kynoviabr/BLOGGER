import { marked } from 'marked';
import {
  PublisherProvider,
  MediaUploadInput,
  MediaUploadResult,
  ArticlePublishInput,
  PublishResult,
} from './publisher-provider.interface';
import { PublishingError } from '@/lib/errors/publisher.errors';
import { logger } from '@/lib/logger';
import { formatArticleForWordPress } from '@/services/editorial/content-formatter';

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
  private categoriesCache: Array<{ id: number; name: string; slug: string }> | null = null;

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
   * Normaliza texto para comparação fonética/sem acentos
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Busca todas as categorias existentes do WordPress remoto
   */
  async fetchAllCategories(): Promise<Array<{ id: number; name: string; slug: string }>> {
    if (this.categoriesCache && this.categoriesCache.length > 0) {
      return this.categoriesCache;
    }

    try {
      const endpoint = `${this.siteUrl}/wp-json/wp/v2/categories?per_page=100`;
      const response = await fetch(endpoint, {
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          this.categoriesCache = data.map((c) => ({
            id: Number(c.id),
            name: String(c.name || ''),
            slug: String(c.slug || ''),
          }));
          return this.categoriesCache;
        }
      }
    } catch (err) {
      logger.warn(this.name, `Falha ao carregar categorias do WP: ${String(err)}`);
    }

    return this.categoriesCache || [];
  }

  /**
   * Resolve o ID numérico da categoria pelo SLUG via GET /wp-json/wp/v2/categories?slug=<slug>.
   * Se não for encontrado, interrompe a execução com erro sem publicar.
   */
  async getCategoryIdBySlug(slug: string): Promise<number> {
    if (!slug || !slug.trim()) {
      throw new PublishingError('Slug de categoria vazio ou inválido fornecido.', {
        provider: this.name,
        statusCode: 400,
        isRetryable: false,
      });
    }

    const cleanSlug = slug.trim().toLowerCase();

    // 1. Procura no cache em memória
    if (this.categoriesCache && this.categoriesCache.length > 0) {
      const cached = this.categoriesCache.find((c) => c.slug.toLowerCase() === cleanSlug);
      if (cached && cached.id !== 1) {
        return cached.id;
      }
    }

    // 2. Consulta via REST API oficial do WordPress
    const endpoint = `${this.siteUrl}/wp-json/wp/v2/categories?slug=${encodeURIComponent(cleanSlug)}`;

    try {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const category = data[0];
          const catId = Number(category.id);
          if (catId === 1) { // 1 = Uncategorized
            throw new PublishingError(
              `A categoria encontrada para o slug "${cleanSlug}" é "Uncategorized" (ID 1). Publicação rejeitada.`,
              { provider: this.name, statusCode: 422, isRetryable: false }
            );
          }

          // Atualiza cache
          if (!this.categoriesCache) this.categoriesCache = [];
          if (!this.categoriesCache.some((c) => c.id === catId)) {
            this.categoriesCache.push({ id: catId, name: String(category.name), slug: cleanSlug });
          }

          logger.info(this.name, `Categoria resolvida via slug "${cleanSlug}": ID ${catId} (${category.name})`);
          return catId;
        }
      }
    } catch (err: unknown) {
      if (err instanceof PublishingError) throw err;
      logger.error(this.name, `Erro ao consultar categoria por slug no WP: ${String(err)}`);
    }

    // 3. Slug não encontrado: interrompe e avisa, sem publicar
    throw new PublishingError(
      `Categoria com slug "${cleanSlug}" não foi encontrada no WordPress em ${this.siteUrl}. Publicação interrompida para evitar publicação sem categoria ou Uncategorized.`,
      {
        provider: this.name,
        statusCode: 404,
        isRetryable: false,
      }
    );
  }

  /**
   * Resolve o ID numérico da categoria no WordPress. Se não existir, tenta criá-la.
   */
  async resolveCategory(nameOrSlug: string): Promise<number | null> {
    if (!nameOrSlug || !nameOrSlug.trim()) return null;

    const query = nameOrSlug.trim();
    const normalizedQuery = this.normalizeString(query);

    const categories = await this.fetchAllCategories();

    // 1. Procura por correspondência exata ou normalizada em slug ou nome
    const match = categories.find((c) => {
      if (c.slug.toLowerCase() === query.toLowerCase()) return true;
      if (c.name.toLowerCase() === query.toLowerCase()) return true;
      const normalizedName = this.normalizeString(c.name);
      const normalizedSlug = this.normalizeString(c.slug);
      return (
        normalizedName === normalizedQuery ||
        normalizedSlug === normalizedQuery ||
        normalizedName.includes(normalizedQuery) ||
        normalizedQuery.includes(normalizedName)
      );
    });

    if (match && match.id !== 1) { // 1 = Uncategorized
      logger.info(this.name, `Categoria "${query}" mapeada para ID WP: ${match.id} (${match.name})`);
      return match.id;
    }

    // 2. Não encontrada no WP: tentar criar dinamicamente via REST API
    try {
      const slugCandidate = query
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      logger.info(this.name, `Criando nova categoria no WordPress: "${query}" (slug: ${slugCandidate})`);
      const endpoint = `${this.siteUrl}/wp-json/wp/v2/categories`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: query,
          slug: slugCandidate,
        }),
      });

      if (response.ok) {
        const created = await response.json();
        const newCat = {
          id: Number(created.id),
          name: String(created.name),
          slug: String(created.slug),
        };
        if (!this.categoriesCache) this.categoriesCache = [];
        this.categoriesCache.push(newCat);
        logger.info(this.name, `Categoria "${query}" criada com sucesso no WP com ID: ${newCat.id}`);
        return newCat.id;
      } else {
        const errorData = await response.json().catch(() => ({}));
        // Se a categoria já existia com outro ID retornado no erro:
        if (errorData?.data?.term_id) {
          return Number(errorData.data.term_id);
        }
        logger.warn(this.name, `Resposta não-200 ao criar categoria WP: ${JSON.stringify(errorData)}`);
      }
    } catch (createErr) {
      logger.warn(this.name, `Erro ao criar categoria no WP: ${String(createErr)}`);
    }

    return null;
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

    // Formata o conteúdo para HTML semântico com tabelas, caixas de monetização e aviso legal obrigatório
    const formatted = await formatArticleForWordPress(article.content || '', {
      title: article.title,
      categorySlug: article.categorySlug,
      providedExcerpt: article.excerpt,
      language: article.language,
      offers: article.offers,
    });

    const payload: Record<string, unknown> = {
      title: article.title,
      content: formatted.html,
      status: article.status,
    };

    if (article.slug) {
      payload.slug = article.slug;
    }

    payload.excerpt = formatted.excerpt;

    if (article.scheduledDate) {
      payload.date = article.scheduledDate;
    }

    let finalCategories = article.categories && article.categories.length > 0 ? [...article.categories] : [];

    // Prioridade máxima: resolução rigorosa por categorySlug
    if (article.categorySlug) {
      const catId = await this.getCategoryIdBySlug(article.categorySlug);
      finalCategories = [catId];
    } else if (finalCategories.length === 0 && article.categoryNames && article.categoryNames.length > 0) {
      for (const catName of article.categoryNames) {
        const catId = await this.resolveCategory(catName);
        if (catId && !finalCategories.includes(catId)) {
          finalCategories.push(catId);
        }
      }
    }

    if (finalCategories.length > 0) {
      payload.categories = finalCategories;
    }

    if (article.tags && article.tags.length > 0) {
      payload.tags = article.tags;
    }

    if (article.featuredMediaId) {
      payload.featured_media = Number(article.featuredMediaId);
    }

    // Autor dinâmico: prioritiza article.authorId, depois env WP_AUTHOR_ID
    const authorId = article.authorId || (process.env.WP_AUTHOR_ID ? Number(process.env.WP_AUTHOR_ID) : undefined);
    if (authorId && !isNaN(authorId)) {
      payload.author = authorId;
    }

    // Metadados Rank Math SEO
    const rankMathMeta: Record<string, string> = {};
    if (article.metaTitle) rankMathMeta.rank_math_title = article.metaTitle;
    if (article.metaDescription || formatted.excerpt) {
      rankMathMeta.rank_math_description = article.metaDescription || formatted.excerpt;
    }
    if (article.primaryKeyword) rankMathMeta.rank_math_focus_keyword = article.primaryKeyword;

    if (Object.keys(rankMathMeta).length > 0) {
      payload.meta = rankMathMeta;
    }

    // Modo Dry Run: não dispara POST, apenas simula retorno
    if (article.dryRun) {
      logger.info(this.name, `[DRY-RUN] Simulação de publicação de artigo realizada com sucesso: "${article.title}"`, {
        payload,
      });
      return {
        success: true,
        postId: 999999,
        url: `${this.siteUrl}/simulacao/${article.slug || 'dry-run'}`,
        status: article.status,
        publishedAt: new Date().toISOString(),
        provider: this.name,
      };
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
