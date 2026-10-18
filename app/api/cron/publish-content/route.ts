import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/auth/cron';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { createPublisherProviderForBlog } from '@/services/publisher';
import { MonetizationService } from '@/services/monetization';
import { logger } from '@/lib/logger';
import { Json } from '@/types/database';

export const maxDuration = 60; // 60 segundos para Vercel Serverless

export async function POST(request: NextRequest) {
  return handlePublishContent(request);
}

async function handlePublishContent(request: NextRequest) {
  const startTime = Date.now();

  // 1. Validação de Autorização: Aceita Bearer CRON_SECRET (do Supabase pg_cron) OU Sessão de Usuário Autenticado no Painel
  const isCronAuthorized = verifyCronSecret(request);
  let isUserAuthorized = false;

  if (!isCronAuthorized) {
    try {
      const userSupabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await userSupabase.auth.getUser();
      if (user) {
        isUserAuthorized = true;
      }
    } catch {
      // Ignora erro de sessão se não logado
    }
  }

  if (!isCronAuthorized && !isUserAuthorized) {
    logger.warn('Cron.publishContent', 'Acesso negado: Autenticação ausente ou inválida (requer Bearer CRON_SECRET ou login)');
    return NextResponse.json(
      { success: false, error: 'Não autorizado. Requer Bearer CRON_SECRET ou usuário autenticado.' },
      { status: 401 }
    );
  }

  logger.info('Cron.publishContent', 'Iniciando verificação de publicações agendadas e prontas');

  let adminSupabase;
  try {
    adminSupabase = getSupabaseAdminClient();
  } catch (err) {
    logger.error('Cron.publishContent', 'Falha ao inicializar Supabase Admin', { err });
    return NextResponse.json(
      { success: false, error: 'Erro de configuração do servidor (Service Role).' },
      { status: 500 }
    );
  }

  try {
    // 2. Buscar artigos candidatos com status 'ready' ou 'scheduled'
    const { data: candidates, error: fetchError } = await adminSupabase
      .from('content_items')
      .select(`
        *,
        blog:blogs(*),
        editorial_calendar:editorial_calendar(id, topic, category_id, scheduled_at, status, category:categories(id, name, slug)),
        featured_image:media_assets!content_items_featured_image_id_fkey(*)
      `)
      .in('status', ['ready', 'scheduled'])
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      logger.error('Cron.publishContent', 'Erro ao consultar content_items', { error: fetchError });
      throw new Error(`Erro ao buscar artigos: ${fetchError.message}`);
    }

    if (!candidates || candidates.length === 0) {
      logger.info('Cron.publishContent', 'Nenhum artigo agendado ou pronto nesta execução.');
      return NextResponse.json({
        success: true,
        message: 'Nenhum artigo pendente de publicação.',
        publishedCount: 0,
        eligibleCount: 0,
      });
    }

    // 3. Filtrar artigos cujo horário agendado já chegou (scheduled_at <= NOW) ou que estão prontos sem data
    const now = Date.now();
    const readyArticles = candidates
      .filter((article) => {
        const targetTime = (article as any).editorial_calendar?.scheduled_at;

        if (targetTime) {
          const targetTimestamp = new Date(targetTime).getTime();
          return targetTimestamp <= now;
        }

        // Se não tem data agendada, publica se estiver expressamente 'ready'
        return article.status === 'ready';
      })
      .slice(0, 5); // Processa até 5 artigos no lote para segurança de timeout

    if (readyArticles.length === 0) {
      logger.info('Cron.publishContent', 'Existem artigos agendados, mas nenhum para o horário atual ou anterior.', {
        totalScheduledFuture: candidates.length,
      });
      return NextResponse.json({
        success: true,
        message: 'Artigos agendados aguardando o horário programado.',
        publishedCount: 0,
        totalScheduledFuture: candidates.length,
      });
    }

    const results = [];

    // 4. Processar cada artigo elegível do lote
    for (const article of readyArticles) {
      const itemStartTime = Date.now();

      if (!article.body || article.body.trim().length === 0) {
        logger.warn('Cron.publishContent', `Artigo ${article.id} sem corpo de texto. Ignorando.`);
        continue;
      }

      const publisher = createPublisherProviderForBlog(article.blog);

      try {
        const categoryData = (article as any).editorial_calendar?.category;
        const categorySlug = categoryData?.slug || undefined;
        const categoryName = categoryData?.name || 'Geral';

        logger.info('Cron.publishContent', `Publicando artigo: "${article.title}" [Categoria: ${categoryName}]`, {
          articleId: article.id,
          blogId: article.blog_id,
          categorySlug,
        });

        let wpFeaturedMediaId: string | number | undefined;

        // 4.1. Upload da imagem destacada para o WordPress se houver
        if (article.featured_image?.public_url) {
          try {
            const imgFetch = await fetch(article.featured_image.public_url);
            if (imgFetch.ok) {
              const arrayBuf = await imgFetch.arrayBuffer();
              const buffer = Buffer.from(arrayBuf);
              const mimeType = imgFetch.headers.get('content-type') || 'image/webp';
              const fileName = `${article.slug || 'artigo'}-${Date.now()}.webp`;

              const mediaUploadResult = await publisher.uploadMedia({
                fileName,
                mimeType,
                data: buffer,
                title: article.title,
                altText: article.featured_image.alt_text || article.title,
              });

              wpFeaturedMediaId = mediaUploadResult.mediaId;
              logger.info('Cron.publishContent', `Mídia enviada para WordPress com ID: ${wpFeaturedMediaId}`);
            }
          } catch (mediaErr) {
            logger.warn('Cron.publishContent', `Falha no upload de mídia para WP: ${String(mediaErr)}`);
          }
        }

        const monetizationOffers = article.blog_id
          ? await MonetizationService.getOffersForCategory(article.blog_id, categorySlug)
          : [];

        // 4.2. Publicar artigo no WordPress
        const publishResult = await publisher.publishArticle({
          title: article.title,
          slug: article.slug,
          content: article.body,
          excerpt: article.excerpt || article.meta_description || undefined,
          status: 'publish',
          categorySlug,
          featuredMediaId: wpFeaturedMediaId,
          metaTitle: article.seo_title || article.title,
          metaDescription: article.meta_description || article.excerpt || undefined,
          focusKeyword: article.focus_keyword || undefined,
          tagNames: Array.isArray(article.tags) ? article.tags : undefined,
          language: article.language,
          offers: monetizationOffers,
          blogName: (article as any).blogs?.name,
          niche: (article as any).blogs?.niche,
          customDisclaimer: ((article as any).blogs?.editorial_config as any)?.disclaimer_html,
        });

        const itemDuration = Date.now() - itemStartTime;

        // 4.3. Atualizar status no Supabase para 'published'
        await adminSupabase
          .from('content_items')
          .update({
            status: 'published',
            published_at: publishResult.publishedAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', article.id);

        const cronPublishedAt = publishResult.publishedAt || new Date().toISOString();

        // Se houver pauta associada no editorial_calendar, atualizar para 'PUBLISHED' e alinhar data no calendário
        if (article.editorial_calendar_id) {
          await adminSupabase
            .from('editorial_calendar')
            .update({
              status: 'PUBLISHED',
              scheduled_at: cronPublishedAt,
              updated_at: new Date().toISOString(),
            })
            .eq('id', article.editorial_calendar_id);
        }

        // 4.4. Registrar log de sucesso
        await adminSupabase.from('system_logs').insert({
          level: 'info',
          service: 'Cron.publishContent',
          message: `Artigo "${article.title}" publicado automaticamente no WordPress. Categoria: ${categoryName}.`,
          metadata: {
            contentId: article.id,
            wpPostId: publishResult.postId,
            wpUrl: publishResult.url,
            category: categoryName,
            durationMs: itemDuration,
          } as Json,
        });

        results.push({
          articleId: article.id,
          title: article.title,
          category: categoryName,
          status: 'PUBLISHED',
          wpPostId: publishResult.postId,
          url: publishResult.url,
          durationMs: itemDuration,
        });
      } catch (itemErr) {
        const itemErrorMessage = itemErr instanceof Error ? itemErr.message : String(itemErr);
        logger.error('Cron.publishContent', `Falha ao publicar artigo ${article.id}: ${itemErrorMessage}`, { error: itemErr });

        await adminSupabase.from('system_logs').insert({
          level: 'error',
          service: 'Cron.publishContent',
          message: `Erro ao publicar artigo ${article.id} no WordPress (mantido para retry): ${itemErrorMessage}`,
          metadata: { articleId: article.id, error: itemErrorMessage } as Json,
        });

        results.push({
          articleId: article.id,
          title: article.title,
          status: 'FAILED_RETRY_SCHEDULED',
          error: itemErrorMessage,
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    logger.info('Cron.publishContent', `Batch de publicação finalizado em ${totalDuration}ms`, { results });

    return NextResponse.json({
      success: true,
      publishedCount: results.filter((r) => r.status === 'PUBLISHED').length,
      totalDurationMs: totalDuration,
      results,
    });
  } catch (error: unknown) {
    const totalDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erro inesperado no Cron de publicação.';
    logger.error('Cron.publishContent', `Erro fatal: ${errorMessage}`, { error });

    try {
      await adminSupabase.from('system_logs').insert({
        level: 'error',
        service: 'Cron.publishContent',
        message: `Falha fatal no Cron de publicação: ${errorMessage}`,
        metadata: { error: errorMessage, totalDuration } as Json,
      });
    } catch {}

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
