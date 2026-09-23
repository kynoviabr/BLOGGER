import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAIProvider, createImageProvider } from '@/services/ai';
import { createPublisherProvider } from '@/services/publisher';
import { logger } from '@/lib/logger';
import { Json } from '@/types/database';

export const maxDuration = 60; // 60 segundos para execução completa do pipeline

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: calendarId } = await params;
  const startTime = Date.now();

  try {
    // 1. Validar sessão do usuário
    const user = await requireAuth();

    const adminSupabase = getSupabaseAdminClient();

    // 2. Buscar dados da pauta e do blog
    const { data: calendarItem, error: calendarError } = await adminSupabase
      .from('editorial_calendar')
      .select('*, blog:blogs(*)')
      .eq('id', calendarId)
      .maybeSingle();

    if (calendarError || !calendarItem) {
      logger.error('API.calendarExecute', `Pauta ${calendarId} não encontrada`, { error: calendarError });
      return NextResponse.json(
        { success: false, error: 'Pauta não encontrada no calendário.' },
        { status: 404 }
      );
    }

    const blog = calendarItem.blog;

    logger.info('API.calendarExecute', `Executando pipeline imediato para a pauta: "${calendarItem.proposed_title}"`, {
      calendarId,
      userId: user.id,
    });

    // 3. Atualizar status da pauta para IN_PROGRESS
    await adminSupabase
      .from('editorial_calendar')
      .update({ status: 'IN_PROGRESS', updated_at: new Date().toISOString() })
      .eq('id', calendarId);

    // 4. Criar ou recuperar registro em content_items
    const tempSlug = calendarItem.proposed_title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Verifica se já existe um content_item vinculado a esta pauta
    const { data: existingContent } = await adminSupabase
      .from('content_items')
      .select('id')
      .eq('editorial_calendar_id', calendarId)
      .maybeSingle();

    let contentId: string;

    if (existingContent) {
      contentId = existingContent.id;
    } else {
      const { data: newContent, error: contentInsertError } = await adminSupabase
        .from('content_items')
        .insert({
          blog_id: calendarItem.blog_id,
          editorial_calendar_id: calendarId,
          language: calendarItem.language || blog?.default_language || 'pt-BR',
          title: calendarItem.proposed_title,
          slug: `${tempSlug}-${Date.now().toString().slice(-4)}`,
          status: 'draft',
          body: '',
        })
        .select()
        .single();

      if (contentInsertError || !newContent) {
        throw new Error(`Falha ao criar item de conteúdo: ${contentInsertError?.message}`);
      }
      contentId = newContent.id;
    }

    // 5. ETAPA 1: Gerar Conteúdo com IA (Gemini)
    const aiProvider = createAIProvider();
    const keywords = calendarItem.keywords && calendarItem.keywords.length > 0
      ? calendarItem.keywords
      : [calendarItem.topic];

    const generatedArticle = await aiProvider.generateArticle(calendarItem.topic, keywords, {
      niche: blog?.niche,
      audience: blog?.audience || undefined,
      language: calendarItem.language || blog?.default_language || 'pt-BR',
      category: calendarItem.category_id || undefined,
      notes: calendarItem.notes || undefined,
    });

    // Salva o artigo gerado imediatamente (garante que falhas na imagem não destruam o artigo)
    await adminSupabase
      .from('content_items')
      .update({
        title: generatedArticle.title,
        slug: generatedArticle.slug,
        meta_description: generatedArticle.metaDescription,
        body: generatedArticle.content,
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', contentId);

    // 6. ETAPA 2: Gerar Imagem de Destaque com IA (Não Bloqueante)
    let generatedImage: { imageUrl?: string; buffer?: Buffer; mimeType?: string; altText?: string; provider?: string } | null = null;
    let mediaAssetId: string | null = null;

    try {
      const imageProvider = createImageProvider();
      const imagePrompt = `Fotografia editorial cinematográfica e elegante de alta resolução para artigo de finanças com o tema: "${generatedArticle.title}". Estilo limpo e profissional.`;
      const imgResult = await imageProvider.generateFeaturedImage(imagePrompt, {
        aspectRatio: '16:9',
        style: 'editorial',
      });
      generatedImage = imgResult;

      let storagePath = imgResult.imageUrl;
      let publicUrl = imgResult.imageUrl;

      // Upload server-side para o bucket blog-assets
      if (imgResult.buffer) {
        try {
          const ext = imgResult.mimeType === 'image/png' ? 'png' : imgResult.mimeType === 'image/webp' ? 'webp' : 'jpg';
          const filePath = `${calendarItem.blog_id}/${contentId}/featured-${Date.now()}.${ext}`;
          const { data: uploadData, error: uploadErr } = await adminSupabase.storage
            .from('blog-assets')
            .upload(filePath, imgResult.buffer, {
              contentType: imgResult.mimeType,
              upsert: true,
            });

          if (!uploadErr && uploadData) {
            storagePath = uploadData.path;
            const { data: pubUrlData } = adminSupabase.storage
              .from('blog-assets')
              .getPublicUrl(uploadData.path);
            publicUrl = pubUrlData.publicUrl;
          }
        } catch (storageErr) {
          logger.warn('API.calendarExecute', `Aviso: Falha ao persistir no storage blog-assets: ${String(storageErr)}`);
        }
      }

      // Salva o asset de imagem
      const { data: insertedAsset, error: mediaError } = await adminSupabase
        .from('media_assets')
        .insert({
          blog_id: calendarItem.blog_id,
          content_id: contentId,
          type: 'image',
          storage_path: storagePath,
          public_url: publicUrl,
          alt_text: imgResult.altText || `Imagem de destaque para ${generatedArticle.title}`,
          prompt: imagePrompt,
          provider: imgResult.provider,
        })
        .select()
        .single();

      if (mediaError) {
        logger.warn('API.calendarExecute', `Aviso: Falha ao salvar asset de imagem: ${mediaError.message}`);
      } else if (insertedAsset) {
        mediaAssetId = insertedAsset.id;
        await adminSupabase
          .from('content_items')
          .update({
            featured_image_id: insertedAsset.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contentId);
      }
    } catch (imageError) {
      logger.warn('API.calendarExecute', `Aviso: Falha na geração de imagem (não bloqueante): ${String(imageError)}`);
      await adminSupabase.from('system_logs').insert({
        level: 'warn',
        service: 'API.calendarExecute',
        message: `Falha na geração de imagem (não bloqueante) para a pauta ${calendarId}: ${imageError instanceof Error ? imageError.message : String(imageError)}`,
        metadata: { calendarId, contentId, error: String(imageError) } as Json,
      });
    }

    // 7. ETAPA 3: Publicar no WordPress
    const publisher = createPublisherProvider();
    let wpFeaturedMediaId: string | number | undefined;

    if (generatedImage?.buffer) {
      try {
        const mimeType = generatedImage.mimeType || 'image/jpeg';
        const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
        const fileName = `${generatedArticle.slug}-${Date.now()}.${ext}`;

        const mediaUploadResult = await publisher.uploadMedia({
          fileName,
          mimeType,
          data: generatedImage.buffer,
          title: generatedArticle.title,
          altText: generatedImage.altText || generatedArticle.title,
        });
        wpFeaturedMediaId = mediaUploadResult.mediaId;
      } catch (mediaErr) {
        logger.warn('API.calendarExecute', `Falha ao enviar mídia para WP: ${String(mediaErr)}`);
      }
    } else if (generatedImage?.imageUrl) {
      try {
        const imgFetch = await fetch(generatedImage.imageUrl);
        if (imgFetch.ok) {
          const arrayBuf = await imgFetch.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const mimeType = imgFetch.headers.get('content-type') || 'image/jpeg';
          const fileName = `${generatedArticle.slug}-${Date.now()}.jpg`;

          const mediaUploadResult = await publisher.uploadMedia({
            fileName,
            mimeType,
            data: buffer,
            title: generatedArticle.title,
            altText: generatedImage.altText || generatedArticle.title,
          });
          wpFeaturedMediaId = mediaUploadResult.mediaId;
        }
      } catch (mediaErr) {
        logger.warn('API.calendarExecute', `Falha ao enviar mídia para WP: ${String(mediaErr)}`);
      }
    }

    const publishResult = await publisher.publishArticle({
      title: generatedArticle.title,
      slug: generatedArticle.slug,
      content: generatedArticle.content,
      excerpt: generatedArticle.metaDescription,
      status: 'publish',
      featuredMediaId: wpFeaturedMediaId,
    });

    const totalDuration = Date.now() - startTime;

    // 8. Atualizar status finais para 'PUBLISHED'
    await adminSupabase
      .from('content_items')
      .update({
        status: 'published',
        published_at: publishResult.publishedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contentId);

    await adminSupabase
      .from('editorial_calendar')
      .update({
        status: 'PUBLISHED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', calendarId);

    // 9. Registrar métricas e logs
    await adminSupabase.from('ai_runs').insert({
      content_id: contentId,
      agent: 'ExecuteNowPipeline',
      provider: aiProvider.name,
      model: aiProvider.defaultModel,
      status: 'completed',
      input_summary: `Topic: ${calendarItem.topic}`,
      output_summary: `Pipeline Completo: Artigo (${generatedArticle.content.length} chars) + Imagem + WP (${publishResult.url})`,
      estimated_cost: 0.0215,
      duration_ms: totalDuration,
    });

    await adminSupabase.from('system_logs').insert({
      level: 'info',
      service: 'API.calendarExecute',
      message: `Pipeline ponta a ponta executado com sucesso para a pauta "${calendarItem.proposed_title}". Publicado no WordPress.`,
      metadata: {
        calendarId,
        contentId,
        wpPostId: publishResult.postId,
        wpUrl: publishResult.url,
        durationMs: totalDuration,
        userId: user.id,
      } as Json,
    });

    return NextResponse.json({
      success: true,
      message: 'Pipeline executado com sucesso! Artigo publicado no WordPress.',
      data: {
        calendarId,
        contentId,
        wpUrl: publishResult.url,
        status: 'PUBLISHED',
        durationMs: totalDuration,
      },
    });
  } catch (error: unknown) {
    const totalDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erro inesperado ao executar pipeline da pauta.';
    logger.error('API.calendarExecute', `Erro fatal: ${errorMessage}`, { error });

    try {
      const adminSupabase = getSupabaseAdminClient();
      await adminSupabase
        .from('editorial_calendar')
        .update({ status: 'FAILED', updated_at: new Date().toISOString() })
        .eq('id', calendarId);

      await adminSupabase.from('system_logs').insert({
        level: 'error',
        service: 'API.calendarExecute',
        message: `Falha ao executar pipeline imediato da pauta ${calendarId}: ${errorMessage}`,
        metadata: { calendarId, error: errorMessage, durationMs: totalDuration } as Json,
      });
    } catch {}

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
