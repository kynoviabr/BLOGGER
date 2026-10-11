import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/auth/cron';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createPublisherProvider, createPublisherProviderForBlog } from '@/services/publisher';
import { logger } from '@/lib/logger';
import { Json } from '@/types/database';

export const maxDuration = 60; // 60 segundos para Vercel Serverless

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // 1. Validação do CRON_SECRET
  if (!verifyCronSecret(request)) {
    logger.warn('Cron.publishContent', 'Acesso negado: Bearer token ausente ou inválido');
    return NextResponse.json(
      { success: false, error: 'Não autorizado. CRON_SECRET inválido ou ausente.' },
      { status: 401 }
    );
  }

  logger.info('Cron.publishContent', 'Iniciando batch de publicação automática no WordPress');

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
    // 2. Buscar artigos elegíveis com status 'ready' (Batch limit: 2 a 3)
    const { data: readyArticles, error: fetchError } = await adminSupabase
      .from('content_items')
      .select('*, blog:blogs(*), featured_image:media_assets!content_items_featured_image_id_fkey(*)')
      .eq('status', 'ready')
      .order('created_at', { ascending: true })
      .limit(3);

    if (fetchError) {
      logger.error('Cron.publishContent', 'Erro ao consultar content_items', { error: fetchError });
      throw new Error(`Erro ao buscar artigos prontos: ${fetchError.message}`);
    }

    if (!readyArticles || readyArticles.length === 0) {
      logger.info('Cron.publishContent', 'Nenhum artigo pronto para publicação nesta execução.');
      return NextResponse.json({
        success: true,
        message: 'Nenhum artigo pendente de publicação.',
        publishedCount: 0,
      });
    }

    const results = [];

    // 3. Processar cada artigo do lote
    for (const article of readyArticles) {
      const itemStartTime = Date.now();

      // Se o artigo não possuir corpo de texto, não publica
      if (!article.body || article.body.trim().length === 0) {
        logger.warn('Cron.publishContent', `Artigo ${article.id} sem corpo de texto. Ignorando.`);
        continue;
      }

      const publisher = createPublisherProviderForBlog(article.blog);

      try {
        logger.info('Cron.publishContent', `Publicando artigo: "${article.title}"`, {
          articleId: article.id,
          blogId: article.blog_id,
        });

        let wpFeaturedMediaId: string | number | undefined;

        // 3.1. Se houver imagem destacada, fazer download e upload para WordPress
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

        // 3.2. Publicar artigo no WordPress
        const publishResult = await publisher.publishArticle({
          title: article.title,
          slug: article.slug,
          content: article.body,
          excerpt: article.excerpt || undefined,
          status: 'publish',
          featuredMediaId: wpFeaturedMediaId,
        });

        const itemDuration = Date.now() - itemStartTime;

        // 3.3. Atualizar status no Supabase para 'published'
        await adminSupabase
          .from('content_items')
          .update({
            status: 'published',
            published_at: publishResult.publishedAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', article.id);

        // Se houver pauta associada no editorial_calendar, atualizar para 'PUBLISHED'
        if (article.editorial_calendar_id) {
          await adminSupabase
            .from('editorial_calendar')
            .update({ status: 'PUBLISHED', updated_at: new Date().toISOString() })
            .eq('id', article.editorial_calendar_id);
        }

        // 3.4. Registrar log de sucesso
        await adminSupabase.from('system_logs').insert({
          level: 'info',
          service: 'Cron.publishContent',
          message: `Artigo "${article.title}" publicado automaticamente no WordPress.`,
          metadata: {
            contentId: article.id,
            wpPostId: publishResult.postId,
            wpUrl: publishResult.url,
            durationMs: itemDuration,
          } as Json,
        });

        results.push({
          articleId: article.id,
          title: article.title,
          status: 'PUBLISHED',
          wpPostId: publishResult.postId,
          url: publishResult.url,
          durationMs: itemDuration,
        });
      } catch (itemErr) {
        const itemErrorMessage = itemErr instanceof Error ? itemErr.message : String(itemErr);
        logger.error('Cron.publishContent', `Falha ao publicar artigo ${article.id}: ${itemErrorMessage}`, { error: itemErr });

        // Tratamento de resiliência: mantém o status como 'ready' para permitir retentativa no próximo ciclo de cron
        await adminSupabase.from('system_logs').insert({
          level: 'error',
          service: 'Cron.publishContent',
          message: `Erro ao publicar artigo ${article.id} no WordPress (mantido como 'ready' para retry): ${itemErrorMessage}`,
          metadata: { articleId: article.id, error: itemErrorMessage } as Json,
        });

        results.push({
          articleId: article.id,
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
