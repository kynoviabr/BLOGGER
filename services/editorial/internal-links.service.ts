import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export interface InternalLinkCandidate {
  id: string;
  title: string;
  slug: string;
  url: string;
  category?: string;
  categorySlug?: string;
}

export interface InternalLinksOptions {
  currentArticleId?: string;
  categoryId?: string;
  categorySlug?: string;
  limit?: number;
}

export class InternalLinksService {
  /**
   * Obtém até 15 artigos já publicados no mesmo blog para alimentar a linkagem interna da IA.
   * Prioriza artigos pertencentes à mesma categoria e ordena por data de publicação decrescente.
   */
  static async getPublishedArticlesForInternalLinking(
    blogId: string,
    options: InternalLinksOptions = {}
  ): Promise<InternalLinkCandidate[]> {
    const limit = options.limit || 15;
    const supabase = getSupabaseAdminClient();

    try {
      // 1. Obter informações de domínio do blog para construir URLs absolutas reais
      const { data: blog, error: blogError } = await supabase
        .from('blogs')
        .select('id, name, domain, editorial_config')
        .eq('id', blogId)
        .maybeSingle();

      if (blogError || !blog) {
        logger.warn('InternalLinksService', `Blog ${blogId} não encontrado ao buscar links internos.`);
        return [];
      }

      const edConfig = blog.editorial_config as Record<string, unknown> | null;
      const wpConfig = edConfig?.wordpress as { wp_site_url?: string } | undefined;

      let baseUrl = wpConfig?.wp_site_url?.trim() || blog.domain?.trim() || '';
      if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        baseUrl = `https://${baseUrl}`;
      }
      baseUrl = baseUrl.replace(/\/+$/, '');

      if (!baseUrl) {
        baseUrl = 'https://meublog.com';
      }

      // 2. Buscar até 30 artigos publicados mais recentes do blog com suas categorias
      let query = supabase
        .from('content_items')
        .select('id, title, slug, published_at, editorial_calendar_id, editorial_calendar:editorial_calendar(category_id, category:categories(id, name, slug))')
        .eq('blog_id', blogId)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(30);

      if (options.currentArticleId) {
        query = query.neq('id', options.currentArticleId);
      }

      const { data: items, error: itemsError } = await query;

      if (itemsError || !items || items.length === 0) {
        logger.info('InternalLinksService', `Nenhum artigo publicado encontrado para links internos no blog ${blogId}.`);
        return [];
      }

      // 3. Mapeia e prioriza: mesma categoria primeiro, depois demais por data
      const candidates: InternalLinkCandidate[] = items
        .filter((item) => Boolean(item.slug && item.title))
        .map((item) => {
          const edCal = item.editorial_calendar as {
            category_id?: string;
            category?: { id?: string; name?: string; slug?: string };
          } | null;

          const catName = edCal?.category?.name;
          const catSlug = edCal?.category?.slug;
          const cleanSlug = item.slug.trim().replace(/^\/+|\/+$/g, '');

          return {
            id: item.id,
            title: item.title.trim(),
            slug: cleanSlug,
            url: `${baseUrl}/${cleanSlug}/`,
            category: catName,
            categorySlug: catSlug,
          };
        });

      const targetCatSlug = options.categorySlug?.toLowerCase().trim();
      const targetCatId = options.categoryId?.toLowerCase().trim();

      // Separa os da mesma categoria dos demais
      const sameCategory: InternalLinkCandidate[] = [];
      const otherCategories: InternalLinkCandidate[] = [];

      for (const cand of candidates) {
        const isSame =
          (targetCatSlug && cand.categorySlug?.toLowerCase() === targetCatSlug) ||
          (targetCatId && cand.category?.toLowerCase() === targetCatId);

        if (isSame) {
          sameCategory.push(cand);
        } else {
          otherCategories.push(cand);
        }
      }

      const combined = [...sameCategory, ...otherCategories].slice(0, limit);

      logger.info(
        'InternalLinksService',
        `Recuperados ${combined.length} artigos para linkagem interna no blog ${blogId} (${sameCategory.length} da mesma categoria).`
      );

      return combined;
    } catch (err) {
      logger.error('InternalLinksService', `Falha ao buscar links internos para blog ${blogId}`, { error: err });
      return [];
    }
  }
}
