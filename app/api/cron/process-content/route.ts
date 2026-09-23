import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/auth/cron';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAIProvider, createImageProvider } from '@/services/ai';
import { logger } from '@/lib/logger';
import { Database, Json } from '@/types/database';

export const maxDuration = 60; // 60 segundos para Vercel Serverless

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // 1. Validação do CRON_SECRET
  if (!verifyCronSecret(request)) {
    logger.warn('Cron.processContent', 'Acesso negado: Bearer token ausente ou inválido');
    return NextResponse.json(
      { success: false, error: 'Não autorizado. CRON_SECRET inválido ou ausente.' },
      { status: 401 }
    );
  }

  logger.info('Cron.processContent', 'Iniciando batch de processamento de pautas agendadas');

  let adminSupabase;
  try {
    adminSupabase = getSupabaseAdminClient();
  } catch (err) {
    logger.error('Cron.processContent', 'Falha ao inicializar Supabase Admin', { err });
    return NextResponse.json(
      { success: false, error: 'Erro de configuração do servidor (Service Role).' },
      { status: 500 }
    );
  }

  try {
    const nowIso = new Date().toISOString();

    // 2. Buscar itens do editorial_calendar elegíveis
    // status 'PLANNED' com scheduled_at nulo ou no passado
    const { data: pendingItems, error: fetchError } = await adminSupabase
      .from('editorial_calendar')
      .select('*, blog:blogs(*)')
      .eq('status', 'PLANNED')
      .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(2);

    if (fetchError) {
      logger.error('Cron.processContent', 'Erro ao consultar editorial_calendar', { error: fetchError });
      throw new Error(`Erro ao buscar pautas: ${fetchError.message}`);
    }

    if (!pendingItems || pendingItems.length === 0) {
      logger.info('Cron.processContent', 'Nenhuma pauta pendente para processamento nesta execução.');
      return NextResponse.json({
        success: true,
        message: 'Nenhuma pauta pendente.',
        processed: 0,
      });
    }

    const aiProvider = createAIProvider();
    const imageProvider = createImageProvider();
    const results = [];

    // 3. Processar cada pauta do batch
    for (const calendarItem of pendingItems) {
      const itemStartTime = Date.now();
      const blog = calendarItem.blog;

      try {
        logger.info('Cron.processContent', `Processando pauta: "${calendarItem.proposed_title}"`, {
          calendarId: calendarItem.id,
          blogId: calendarItem.blog_id,
        });

        // 3.1. Marcar pauta temporariamente como IN_PROGRESS no calendário
        await adminSupabase
          .from('editorial_calendar')
          .update({ status: 'IN_PROGRESS', updated_at: new Date().toISOString() })
          .eq('id', calendarItem.id);

        // 3.2. Criar registro inicial de content_item com status 'draft' / em progresso
        const tempSlug = calendarItem.proposed_title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        const { data: contentItem, error: contentInsertError } = await adminSupabase
          .from('content_items')
          .insert({
            blog_id: calendarItem.blog_id,
            editorial_calendar_id: calendarItem.id,
            language: calendarItem.language || blog?.default_language || 'pt-BR',
            title: calendarItem.proposed_title,
            slug: `${tempSlug}-${Date.now().toString().slice(-4)}`,
            status: 'draft',
            body: '',
          })
          .select()
          .single();

        if (contentInsertError || !contentItem) {
          throw new Error(`Falha ao criar content_item: ${contentInsertError?.message}`);
        }

        // 3.3. Gerar Artigo com AIProvider (Gemini)
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

        // 3.4. Salvar o artigo gerado imediatamente (garante integridade do texto contra falhas de mídia)
        const { error: contentSaveError } = await adminSupabase
          .from('content_items')
          .update({
            title: generatedArticle.title,
            slug: generatedArticle.slug,
            meta_description: generatedArticle.metaDescription,
            body: generatedArticle.content,
            status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', contentItem.id);

        if (contentSaveError) {
          throw new Error(`Falha ao salvar texto do artigo no banco: ${contentSaveError.message}`);
        }

        // 3.5. Gerar Imagem de Destaque com ImageProvider (Não Bloqueante)
        let mediaAssetId: string | null = null;
        try {
          const { data: recentAssets } = await adminSupabase
            .from('media_assets')
            .select('prompt')
            .eq('blog_id', calendarItem.blog_id)
            .order('created_at', { ascending: false })
            .limit(8);

          const recentVisuals = (recentAssets || [])
            .map((asset) => asset.prompt)
            .filter(Boolean)
            .join('\n- ');

          const imagePrompt = `Crie uma imagem de destaque editorial única e específica para o artigo "${generatedArticle.title}".
Tema original: ${calendarItem.topic}.
Palavras-chave: ${keywords.join(', ')}.
Nicho do blog: ${blog?.niche || 'não informado'}.
Público: ${blog?.audience || 'não informado'}.
Use uma metáfora visual diretamente relacionada ao assunto, com cenário, objetos e composição específicos.
Evite imagens genéricas de finanças e clichês como pilhas de moedas, cofrinhos, cartões sobre mesa, executivos olhando notebook e gráficos genéricos, salvo quando forem essenciais ao assunto.
Não inclua texto, letras, números, logotipos ou marcas na imagem.
Varie enquadramento, ambiente, objetos principais e metáfora em relação às imagens recentes.
Prompts recentes a não repetir:
- ${recentVisuals || 'nenhum'}
Estilo: fotografia editorial cinematográfica, elegante, natural, alta resolução, composição limpa, 16:9.`;

          const generatedImage = await imageProvider.generateFeaturedImage(imagePrompt, {
            aspectRatio: '16:9',
            style: 'editorial',
          });

          let storagePath = generatedImage.imageUrl;
          let publicUrl = generatedImage.imageUrl;

          if (generatedImage.buffer) {
            try {
              const ext = generatedImage.mimeType === 'image/png' ? 'png' : generatedImage.mimeType === 'image/webp' ? 'webp' : 'jpg';
              const filePath = `${calendarItem.blog_id}/${contentItem.id}/featured-${Date.now()}.${ext}`;
              const { data: uploadData, error: uploadErr } = await adminSupabase.storage
                .from('blog-assets')
                .upload(filePath, generatedImage.buffer, {
                  contentType: generatedImage.mimeType,
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
              logger.warn('Cron.processContent', `Falha ao persistir no storage blog-assets: ${String(storageErr)}`);
            }
          }

          // Salva asset de imagem
          const { data: mediaAsset, error: mediaError } = await adminSupabase
            .from('media_assets')
            .insert({
              blog_id: calendarItem.blog_id,
              content_id: contentItem.id,
              type: 'image',
              storage_path: storagePath,
              public_url: publicUrl,
              alt_text: generatedImage.altText || `Imagem de destaque para ${generatedArticle.title}`,
              prompt: imagePrompt,
              provider: generatedImage.provider,
            })
            .select()
            .single();

          if (mediaError) {
            logger.warn('Cron.processContent', `Falha ao salvar media_asset: ${mediaError.message}`);
          } else if (mediaAsset) {
            mediaAssetId = mediaAsset.id;
            await adminSupabase
              .from('content_items')
              .update({
                featured_image_id: mediaAsset.id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', contentItem.id);
          }
        } catch (imageErr) {
          logger.warn('Cron.processContent', `Aviso: Geração de imagem falhou de forma não bloqueante para pauta ${calendarItem.id}: ${String(imageErr)}`);
        }

        // 3.6. Atualizar status do editorial_calendar para 'READY'
        await adminSupabase
          .from('editorial_calendar')
          .update({ status: 'READY', updated_at: new Date().toISOString() })
          .eq('id', calendarItem.id);


        // 3.8. Registrar ai_runs
        const itemDuration = Date.now() - itemStartTime;
        await adminSupabase.from('ai_runs').insert({
          content_id: contentItem.id,
          agent: 'CronContentWorker',
          provider: aiProvider.name,
          model: aiProvider.defaultModel,
          status: 'completed',
          input_summary: `Topic: ${calendarItem.topic}`,
          output_summary: `Artigo gerado (${generatedArticle.content.length} chars) + Imagem`,
          estimated_cost: 0.0215,
          duration_ms: itemDuration,
        });

        // 3.9. Registrar system_logs
        await adminSupabase.from('system_logs').insert({
          level: 'info',
          service: 'Cron.processContent',
          message: `Pauta "${calendarItem.proposed_title}" processada com sucesso via Cron. Artigo pronto para publicação.`,
          metadata: {
            calendarId: calendarItem.id,
            contentId: contentItem.id,
            durationMs: itemDuration,
          } as Json,
        });

        results.push({
          calendarId: calendarItem.id,
          contentId: contentItem.id,
          title: generatedArticle.title,
          status: 'READY',
          durationMs: itemDuration,
        });
      } catch (itemErr) {
        const itemErrorMessage = itemErr instanceof Error ? itemErr.message : String(itemErr);
        logger.error('Cron.processContent', `Falha ao processar pauta ${calendarItem.id}: ${itemErrorMessage}`, { error: itemErr });

        // Em caso de falha, marcar calendário como FAILED
        await adminSupabase
          .from('editorial_calendar')
          .update({ status: 'FAILED', updated_at: new Date().toISOString() })
          .eq('id', calendarItem.id);

        await adminSupabase.from('system_logs').insert({
          level: 'error',
          service: 'Cron.processContent',
          message: `Erro ao processar pauta ${calendarItem.id} via Cron: ${itemErrorMessage}`,
          metadata: { calendarId: calendarItem.id, error: itemErrorMessage } as Json,
        });

        results.push({
          calendarId: calendarItem.id,
          status: 'FAILED',
          error: itemErrorMessage,
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    logger.info('Cron.processContent', `Batch finalizado em ${totalDuration}ms`, { results });

    return NextResponse.json({
      success: true,
      processed: results.length,
      totalDurationMs: totalDuration,
      results,
    });
  } catch (error: unknown) {
    const totalDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erro inesperado no Cron de conteúdo.';
    logger.error('Cron.processContent', `Erro fatal: ${errorMessage}`, { error });

    try {
      await adminSupabase.from('system_logs').insert({
        level: 'error',
        service: 'Cron.processContent',
        message: `Falha fatal no Cron de conteúdo: ${errorMessage}`,
        metadata: { error: errorMessage, totalDuration } as Json,
      });
    } catch {}

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
