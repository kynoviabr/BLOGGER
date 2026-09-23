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

    const prompt = `Crie uma imagem de destaque editorial única e específica para o artigo "${contentItem.title}".
Nicho do blog: ${blog?.niche || 'não informado'}.
Público: ${blog?.audience || 'não informado'}.
Use uma metáfora visual diretamente relacionada ao assunto do título, com cenário, objetos e composição específicos.
Evite imagens genéricas de finanças e clichês como pilhas de moedas, cofrinhos, cartões sobre mesa, executivos olhando notebook e gráficos genéricos, salvo quando forem essenciais ao assunto.
Não inclua texto, letras, números, logotipos ou marcas na imagem.
Varie enquadramento, ambiente, objetos principais e metáfora em relação às imagens recentes.
Prompts recentes a não repetir:
- ${recentVisuals || 'nenhum'}
Estilo: fotografia editorial cinematográfica, elegante, natural, alta resolução, composição limpa, 16:9.`;

    // 3. Instanciar ImageProvider via Factory
    const imageProvider = createImageProvider();

    logger.info('API.image', `Iniciando geração de imagem com ${imageProvider.name} para contentId: ${id}`);

    // 4. Executar geração de imagem
    const generatedImage = await imageProvider.generateFeaturedImage(prompt, {
      aspectRatio: '16:9',
      style: 'editorial',
    });

    const durationMs = Date.now() - startTime;

    // 5. Salvar asset em media_assets
    const { data: mediaAsset, error: mediaError } = await supabase
      .from('media_assets')
      .insert({
        blog_id: contentItem.blog_id,
        content_id: id,
        type: 'image',
        storage_path: generatedImage.imageUrl,
        public_url: generatedImage.imageUrl,
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
      .select('*, featured_image:media_assets(*)')
      .single();

    if (updateError) {
      logger.error('API.image', `Falha ao vincular featured_image_id no artigo ${id}`, { error: updateError });
      throw new Error(`Falha ao associar imagem de destaque ao artigo: ${updateError.message}`);
    }

    // 7. Registrar execução em ai_runs
    await supabase.from('ai_runs').insert({
      content_id: id,
      agent: 'ImageAgent (NanoBanana)',
      provider: imageProvider.name,
      model: 'image-gen-v1',
      status: 'completed',
      input_summary: prompt.slice(0, 150),
      output_summary: `Imagem gerada: ${generatedImage.imageUrl.slice(0, 80)}`,
      estimated_cost: 0.02,
      duration_ms: durationMs,
    });

    // 8. Registrar em system_logs
    await LogService.recordLog(
      'info',
      'API.image',
      `Imagem de destaque gerada com sucesso para artigo ${id}`,
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

    logger.error('API.image', `Erro durante o processo de geração de imagem: ${errorMessage}`, { error });

    try {
      const supabase = await getSupabaseServerClient();
      await supabase.from('ai_runs').insert({
        content_id: id,
        agent: 'ImageAgent (NanoBanana)',
        provider: 'NanoBananaProvider',
        model: 'image-gen-v1',
        status: 'failed',
        error: errorMessage,
        duration_ms: durationMs,
        estimated_cost: 0,
      });
      await LogService.recordLog('error', 'API.image', `Falha ao gerar imagem para artigo ${id}: ${errorMessage}`, { error });
    } catch (logErr) {
      logger.warn('API.image', `Falha ao registrar log de erro: ${String(logErr)}`);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: statusCode }
    );
  }
}
