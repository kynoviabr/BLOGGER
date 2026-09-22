import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { createPublisherProvider } from '@/services/publisher';
import { PublishingError } from '@/lib/errors/publisher.errors';
import { logger } from '@/lib/logger';
import { LogService } from '@/services/log.service';

export const maxDuration = 60; // 60 segundos para Vercel Serverless

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const startTime = Date.now();

  try {
    // 1. Validar sessão do usuário
    const user = await requireAuth();

    const supabase = await getSupabaseServerClient();

    // 2. Buscar content_item com blog e imagem destacada
    const { data: contentItem, error: contentError } = await supabase
      .from('content_items')
      .select('*, blog:blogs(*), featured_image:media_assets(*)')
      .eq('id', id)
      .maybeSingle();

    if (contentError || !contentItem) {
      logger.error('API.publish', `Artigo ${id} não encontrado`, { error: contentError });
      return NextResponse.json(
        { success: false, error: 'Artigo não encontrado.' },
        { status: 404 }
      );
    }

    if (!contentItem.body || contentItem.body.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'O artigo não possui conteúdo para ser publicado. Gere o texto primeiro.' },
        { status: 400 }
      );
    }

    const blog = contentItem.blog;

    // 3. Instanciar WordPressProvider via Factory
    const publisher = createPublisherProvider();

    logger.info('API.publish', `Iniciando publicação com ${publisher.name} para o artigo ${id}`);

    let wpFeaturedMediaId: string | number | undefined;

    // 4. Se houver imagem destacada, fazer download e upload para a biblioteca de mídia do WordPress
    if (contentItem.featured_image?.public_url) {
      try {
        const imageUrl = contentItem.featured_image.public_url;
        logger.info('API.publish', `Baixando imagem de destaque para upload no WP: ${imageUrl}`);

        // Busca o binário da imagem
        const imgFetch = await fetch(imageUrl);
        if (imgFetch.ok) {
          const arrayBuf = await imgFetch.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const mimeType = imgFetch.headers.get('content-type') || 'image/webp';
          const fileName = `${contentItem.slug || 'artigo'}-${Date.now()}.webp`;

          const mediaUploadResult = await publisher.uploadMedia({
            fileName,
            mimeType,
            data: buffer,
            title: contentItem.title,
            altText: contentItem.featured_image.alt_text || contentItem.title,
          });

          wpFeaturedMediaId = mediaUploadResult.mediaId;
          logger.info('API.publish', `Mídia enviada para o WordPress com ID: ${wpFeaturedMediaId}`);
        } else {
          logger.warn('API.publish', `Não foi possível baixar imagem de destaque (${imgFetch.status}). Publicando sem imagem destacada no WP.`);
        }
      } catch (mediaUploadErr) {
        logger.warn('API.publish', `Falha ao processar upload de imagem para WP: ${String(mediaUploadErr)}`);
      }
    }

    // 5. Publicar o artigo no WordPress
    const publishResult = await publisher.publishArticle({
      title: contentItem.title,
      slug: contentItem.slug,
      content: contentItem.body,
      excerpt: contentItem.excerpt || undefined,
      status: 'publish',
      featuredMediaId: wpFeaturedMediaId,
    });

    const durationMs = Date.now() - startTime;

    // 6. Atualizar status no Supabase para 'published' com data e URL externa
    const { data: updatedItem, error: updateError } = await supabase
      .from('content_items')
      .update({
        status: 'published',
        published_at: publishResult.publishedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, featured_image:media_assets(*)')
      .single();

    if (updateError) {
      logger.error('API.publish', `Artigo publicado no WP mas erro ao atualizar Supabase: ${updateError.message}`);
    }

    // 7. Registrar em system_logs
    await LogService.recordLog(
      'info',
      'API.publish',
      `Artigo ${id} publicado com sucesso no WordPress`,
      {
        contentId: id,
        wpPostId: publishResult.postId,
        wpUrl: publishResult.url,
        durationMs,
        userId: user.id,
      }
    );

    return NextResponse.json({
      success: true,
      data: updatedItem || contentItem,
      publishResult,
      message: 'Artigo publicado com sucesso no WordPress!',
    });
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erro ao publicar artigo no WordPress.';
    const statusCode = error instanceof PublishingError ? (error.statusCode || 500) : 500;

    logger.error('API.publish', `Erro durante o processo de publicação: ${errorMessage}`, { error });

    try {
      await LogService.recordLog('error', 'API.publish', `Falha ao publicar artigo ${id}: ${errorMessage}`, { error });
    } catch (logErr) {
      logger.warn('API.publish', `Falha ao registrar log de erro de publicação: ${String(logErr)}`);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: statusCode }
    );
  }
}
