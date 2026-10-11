import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { MonetizationService } from './monetization.service';
import {
  injectMonetizationBoxes,
  hasMonetizationBoxes,
  formatArticleForWordPress,
} from '@/services/editorial/content-formatter';
import { createPublisherProviderForBlog } from '@/services/publisher/factory';
import { validateEditorialScope } from '@/services/editorial/scope-guard';
import { logger } from '@/lib/logger';
import { OfficialCategorySlug } from '@/lib/constants/categories';
import { ContentStatus } from '@/types/content';

export interface BackfillArticleOptions {
  forceUpdateExisting?: boolean; // Se true, remove e re-injeta boxes; se false, ignora artigos já com boxes
  syncWordPress?: boolean; // Se true, sincroniza no WordPress se o artigo for 'published'
}

export interface BackfillArticleResult {
  articleId: string;
  title: string;
  slug: string;
  status: string;
  offersFound: number;
  offersInjected: string[];
  supabaseUpdated: boolean;
  wordpressSynced: boolean;
  wordpressPostId?: number;
  error?: string;
}

export interface BackfillBatchResult {
  blogId: string;
  totalArticles: number;
  processedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorsCount: number;
  results: BackfillArticleResult[];
}

export class MonetizationBackfillService {
  /**
   * Executa a retroalimentação de monetização para um único artigo.
   */
  static async backfillSingleArticle(
    articleId: string,
    options: BackfillArticleOptions = {}
  ): Promise<BackfillArticleResult> {
    const supabase = getSupabaseAdminClient();
    const forceUpdate = options.forceUpdateExisting ?? true;
    const syncWp = options.syncWordPress ?? true;

    // 1. Busca o artigo com relações de blog e pauta/categoria
    const { data: item, error: fetchError } = await supabase
      .from('content_items')
      .select('*, blog:blogs(*), editorial_calendar:editorial_calendar(*, category:categories(*))')
      .eq('id', articleId)
      .maybeSingle();

    if (fetchError || !item) {
      return {
        articleId,
        title: item?.title || 'Desconhecido',
        slug: item?.slug || '',
        status: item?.status || 'unknown',
        offersFound: 0,
        offersInjected: [],
        supabaseUpdated: false,
        wordpressSynced: false,
        error: fetchError?.message || 'Artigo não encontrado.',
      };
    }

    if (!item.body || item.body.trim().length === 0) {
      return {
        articleId,
        title: item.title,
        slug: item.slug,
        status: item.status,
        offersFound: 0,
        offersInjected: [],
        supabaseUpdated: false,
        wordpressSynced: false,
        error: 'Artigo vazio sem corpo de texto.',
      };
    }

    // 2. Se forceUpdate for falso e já possuir caixas, pula
    if (!forceUpdate && hasMonetizationBoxes(item.body)) {
      return {
        articleId,
        title: item.title,
        slug: item.slug,
        status: item.status,
        offersFound: 0,
        offersInjected: [],
        supabaseUpdated: false,
        wordpressSynced: false,
        error: 'Ignorado: artigo já possui caixa de monetização ativa.',
      };
    }

    // 3. Determina a categoria do artigo
    const scopeCheck = validateEditorialScope(item.title, [item.slug]);
    let categorySlug: OfficialCategorySlug = scopeCheck.matchedCategorySlug || 'saindo-das-dividas';
    const edCal = item.editorial_calendar as { category?: { name: string; slug: string } } | null;
    if (edCal?.category?.slug) {
      const slugVal = edCal.category.slug.toLowerCase().trim();
      if (['cartoes', 'emprestimos', 'investimentos', 'milhas-e-pontos', 'saindo-das-dividas'].includes(slugVal)) {
        categorySlug = slugVal as OfficialCategorySlug;
      }
    }

    // 4. Busca as ofertas correspondentes para o blog e categoria
    const offers = await MonetizationService.getOffersForCategory(item.blog_id, categorySlug);

    if (offers.length === 0) {
      return {
        articleId,
        title: item.title,
        slug: item.slug,
        status: item.status,
        offersFound: 0,
        offersInjected: [],
        supabaseUpdated: false,
        wordpressSynced: false,
        error: `Nenhuma oferta ativa vinculada à categoria "${categorySlug}" ou global.`,
      };
    }

    // 5. Injeta deterministicamente as caixas no corpo de texto
    const updatedBody = injectMonetizationBoxes(item.body, offers, { forceReplace: forceUpdate });

    // 6. Atualiza no Supabase
    const { error: updateError } = await supabase
      .from('content_items')
      .update({
        body: updatedBody,
        updated_at: new Date().toISOString(),
      })
      .eq('id', articleId);

    if (updateError) {
      logger.error('MonetizationBackfillService', `Erro ao atualizar artigo ${articleId} no Supabase`, { error: updateError });
      return {
        articleId,
        title: item.title,
        slug: item.slug,
        status: item.status,
        offersFound: offers.length,
        offersInjected: offers.map((o) => o.title),
        supabaseUpdated: false,
        wordpressSynced: false,
        error: `Falha ao salvar no banco: ${updateError.message}`,
      };
    }

    let wordpressSynced = false;
    let wordpressPostId: number | undefined;
    let wpError: string | undefined;

    // 7. Sincronização direta com WordPress se o artigo estiver publicado
    if (syncWp && item.status === 'published' && item.blog) {
      try {
        const publisher = createPublisherProviderForBlog(item.blog);

        if (publisher.getPostBySlug && publisher.updatePostContent) {
          const wpPost = await publisher.getPostBySlug(item.slug);

          if (wpPost?.id) {
            wordpressPostId = wpPost.id;
            // Formata o artigo completo para HTML do WordPress
            const formatted = await formatArticleForWordPress(item.body, {
              title: item.title,
              categorySlug,
              language: item.language || 'pt-BR',
              offers,
            });

            const success = await publisher.updatePostContent(wpPost.id, formatted.html);
            wordpressSynced = success;
            if (!success) {
              wpError = `Falha na requisição de atualização do post WordPress ID ${wpPost.id}.`;
            }
          } else {
            wpError = `Post com slug "${item.slug}" não foi localizado no WordPress para atualização remota.`;
          }
        }
      } catch (syncErr) {
        wpError = `Exceção na sincronização WordPress: ${String(syncErr)}`;
        logger.error('MonetizationBackfillService', `Erro na sincronização WordPress`, { error: syncErr });
      }
    }

    return {
      articleId,
      title: item.title,
      slug: item.slug,
      status: item.status,
      offersFound: offers.length,
      offersInjected: offers.map((o) => o.title),
      supabaseUpdated: true,
      wordpressSynced,
      wordpressPostId,
      error: wpError,
    };
  }

  /**
   * Executa a retroalimentação de monetização em lote para todos os artigos de um Blog.
   */
  static async backfillBlogArticles(
    blogId: string,
    options: BackfillArticleOptions & { statusFilter?: ContentStatus[] } = {}
  ): Promise<BackfillBatchResult> {
    const supabase = getSupabaseAdminClient();
    const statuses: ContentStatus[] = options.statusFilter || ['published', 'ready', 'draft'];

    logger.info('MonetizationBackfillService', `Iniciando backfill para o blog ${blogId}`, {
      statuses,
      options,
    });

    // 1. Busca todos os artigos candidatos do blog
    const { data: articles, error } = await supabase
      .from('content_items')
      .select('id, title, slug, status')
      .eq('blog_id', blogId)
      .in('status', statuses)
      .order('created_at', { ascending: false });

    if (error || !articles) {
      logger.error('MonetizationBackfillService', `Erro ao listar artigos para backfill`, { error });
      throw new Error(`Falha ao listar artigos para backfill: ${error?.message}`);
    }

    const results: BackfillArticleResult[] = [];
    let updatedCount = 0;
    let skippedCount = 0;
    let errorsCount = 0;

    // 2. Itera sobre cada artigo aplicando a injeção determinística
    for (const art of articles) {
      const res = await this.backfillSingleArticle(art.id, options);
      results.push(res);

      if (res.supabaseUpdated) {
        updatedCount++;
      } else if (res.error?.startsWith('Ignorado') || res.error?.includes('Nenhuma oferta')) {
        skippedCount++;
      } else {
        errorsCount++;
      }
    }

    logger.info('MonetizationBackfillService', `Backfill concluído para o blog ${blogId}`, {
      total: articles.length,
      updatedCount,
      skippedCount,
      errorsCount,
    });

    return {
      blogId,
      totalArticles: articles.length,
      processedCount: results.length,
      updatedCount,
      skippedCount,
      errorsCount,
      results,
    };
  }
}
