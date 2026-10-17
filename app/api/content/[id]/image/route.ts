import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { createImageProvider } from '@/services/ai';
import { ImageProviderError } from '@/lib/errors/ai.errors';
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

    // 2. Buscar content_item e blog associado
    const { data: contentItem, error: contentError } = await supabase
      .from('content_items')
      .select('*, blog:blogs(*)')
      .eq('id', id)
      .maybeSingle();

    if (contentError || !contentItem) {
      logger.error('API.image', `Artigo ${id} não encontrado`, { error: contentError });
      return NextResponse.json(
        { success: false, error: 'Artigo não encontrado.' },
        { status: 404 }
      );
    }

    const blog = contentItem.blog;
    const recentAssets = await supabase
      .from('media_assets')
      .select('prompt')
      .eq('blog_id', contentItem.blog_id)
      .order('created_at', { ascending: false })
      .limit(8);

    const recentVisuals = (recentAssets.data || [])
      .map((asset) => asset.prompt)
      .filter(Boolean)
      .join('\n- ');

    // 5 estilos visuais sofisticados para rotação editorial
    const visualStyles = [
      'Conceptual minimalist still life photography, real physical objects in elegant studio composition (golden keys, precision scales, metallic gears, growing green plants on solid marble)',
      'Editorial isometric 3D render, minimalist Blender/C4D aesthetic, smooth matte textures, soft studio lighting, abstract geometric shapes representing balance and progress',
      'Modern architectural and urban photography, grand perspective, majestic concrete and glass facades, illuminated bridges, dynamic urban geometry conveying scale and future',
      'Artistic macro photography, extreme close-up of rich textures, brushed metal, intricate watchmaking mechanics, watermark paper fibers, dramatic chiaroscuro lighting',
      'Editorial conceptual flat illustration and collage, The New Yorker and The Economist cover style, bold contrasting colors, modern graphic design'
    ];
    const selectedStyle = visualStyles[Math.floor(Math.random() * visualStyles.length)];

    const prompt = `${selectedStyle}. Visual metaphor for personal finance theme: "${contentItem.title}". Editorial studio lighting, shallow depth of field, 8k, hyper-detailed, clean elegant composition, no text, no logos, no watermarks, no screens, no laptops, no smartphones, no office desks`;

    // 3. Instanciar ImageProvider via Factory
    const imageProvider = createImageProvider();

    logger.info('API.image', `Iniciando geração de imagem com ${imageProvider.name} para contentId: ${id}`);

    // 4. Executar geração de imagem
    const generatedImage = await imageProvider.generateFeaturedImage(prompt, {
      aspectRatio: '16:9',
      style: 'editorial',
    });

    const durationMs = Date.now() - startTime;

    // 5. Upload para Supabase Storage (blog-assets) e salvar asset em media_assets
    let storagePath = generatedImage.imageUrl;
    let publicUrl = generatedImage.imageUrl;

    if (generatedImage.buffer) {
      try {
        const { ImageOptimizer } = await import('@/lib/image-optimizer');
        const optimized = await ImageOptimizer.optimize(
          generatedImage.buffer,
          generatedImage.mimeType || 'image/jpeg',
          { format: 'webp', quality: 82 }
        );

        const filePath = `${contentItem.blog_id}/${id}/featured-${Date.now()}.webp`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('blog-assets')
          .upload(filePath, optimized.buffer, {
            contentType: 'image/webp',
            upsert: true,
          });

        if (!uploadErr && uploadData) {
          storagePath = uploadData.path;
          const { data: pubUrlData } = supabase.storage
            .from('blog-assets')
            .getPublicUrl(uploadData.path);
          publicUrl = pubUrlData.publicUrl;
        } else if (uploadErr) {
          logger.warn('API.image', `Aviso: Upload para blog-assets falhou (${uploadErr.message}). Utilizando URL direta do provedor.`);
        }
      } catch (storageErr) {
        logger.warn('API.image', `Aviso: Erro no upload para storage: ${String(storageErr)}`);
      }
    }

    const { data: mediaAsset, error: mediaError } = await supabase
      .from('media_assets')
      .insert({
        blog_id: contentItem.blog_id,
        content_id: id,
        type: 'image',
        storage_path: storagePath,
        public_url: publicUrl,
        alt_text: generatedImage.altText || `Imagem de destaque para ${contentItem.title}`,
        prompt,
        provider: generatedImage.provider,
      })
      .select()
      .single();

    if (mediaError) {
      logger.error('API.image', `Falha ao salvar media_asset no Supabase`, { error: mediaError });
      throw new Error(`Falha ao registrar imagem no banco: ${mediaError.message}`);
    }

    // 6. Vincular featured_image_id no content_items
    const { data: updatedItem, error: updateError } = await supabase
      .from('content_items')
      .update({
        featured_image_id: mediaAsset.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, featured_image:media_assets!content_items_featured_image_id_fkey(*)')
      .single();

    if (updateError) {
      logger.error('API.image', `Falha ao vincular featured_image_id no artigo ${id}`, { error: updateError });
      throw new Error(`Falha ao associar imagem de destaque ao artigo: ${updateError.message}`);
    }

    // 7. Registrar execução em ai_runs
    await supabase.from('ai_runs').insert({
      content_id: id,
      agent: 'ImageAgent (OpenAI)',
      provider: imageProvider.name,
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini',
      status: 'completed',
      input_summary: prompt.slice(0, 150),
      output_summary: `Imagem gerada: ${publicUrl.slice(0, 80)}`,
      estimated_cost: 0,
      duration_ms: durationMs,
    });

    // 8. Registrar em system_logs
    await LogService.recordLog(
      'info',
      'API.image',
      `Imagem de destaque gerada com sucesso via OpenAI para artigo ${id}`,
      { contentId: id, mediaId: mediaAsset.id, durationMs, userId: user.id }
    );

    return NextResponse.json({
      success: true,
      data: updatedItem,
      media: mediaAsset,
      message: 'Imagem de destaque gerada com sucesso!',
    });
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao gerar imagem.';
    const statusCode = error instanceof ImageProviderError ? (error.statusCode || 500) : 500;

    logger.error('API.image', `Erro durante o processo de geração de imagem com OpenAI: ${errorMessage}`, { error });

    try {
      const supabase = await getSupabaseServerClient();
      await supabase.from('ai_runs').insert({
        content_id: id,
        agent: 'ImageAgent (OpenAI)',
        provider: 'OpenAIImageProvider',
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini',
        status: 'failed',
        error: errorMessage,
        duration_ms: durationMs,
        estimated_cost: 0,
      });
      await LogService.recordLog('error', 'OpenAIImageProvider', `Falha ao gerar imagem com OpenAI para artigo ${id}: ${errorMessage}`, { error });
    } catch (logErr) {
      logger.warn('API.image', `Falha ao registrar log de erro: ${String(logErr)}`);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: statusCode }
    );
  }
}
