import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAIProvider, createImageProvider } from '@/services/ai';
import { ResearchService } from '@/services/research';
import { createPublisherProvider } from '@/services/publisher';
import { logger } from '@/lib/logger';
import { Json } from '@/types/database';

export interface PipelineExecutionResult {
  success: boolean;
  calendarId: string;
  contentId?: string;
  wpUrl?: string;
  wpPostId?: string | number;
  status: 'PUBLISHED' | 'FAILED';
  durationMs: number;
  error?: string;
}

export class PipelineService {
  /**
   * Executa o pipeline ponta a ponta para uma pauta:
   * 1. Status -> IN_PROGRESS
   * 2. Gera Artigo com Gemini
   * 3. Salva rascunho de texto imediatamente
   * 4. Gera Imagem de Destaque com Pollinations (não bloqueante)
   * 5. Upload do buffer de imagem para Supabase Storage (blog-assets)
   * 6. Publica no WordPress (artigo + imagem)
   * 7. Status -> PUBLISHED
   */
  static async executeItem(
    calendarId: string,
    options: { triggeredBy?: string; userId?: string } = {}
  ): Promise<PipelineExecutionResult> {
    const startTime = Date.now();
    const adminSupabase = getSupabaseAdminClient();

    try {
      // 1. Buscar dados da pauta, blog e categoria
      const { data: calendarItem, error: calendarError } = await adminSupabase
        .from('editorial_calendar')
        .select('*, blog:blogs(*), category:categories(*)')
        .eq('id', calendarId)
        .maybeSingle();

      if (calendarError || !calendarItem) {
        throw new Error(`Pauta ${calendarId} não encontrada no calendário.`);
      }

      const blog = calendarItem.blog;

      // 1.1 Se a pauta não tem categoria associada, resolver e persistir a melhor categoria do blog
      let calendarCategory = calendarItem.category as { id: string; name: string; slug: string } | null;
      if (!calendarCategory) {
        const { data: blogCategories } = await adminSupabase
          .from('categories')
          .select('id, name, slug')
          .eq('blog_id', calendarItem.blog_id);

        if (blogCategories && blogCategories.length > 0) {
          const textToMatch = `${calendarItem.proposed_title} ${calendarItem.topic} ${(calendarItem.keywords || []).join(' ')}`.toLowerCase();

          let matched = blogCategories.find((cat) => {
            const catNameLower = cat.name.toLowerCase();
            const catSlugLower = cat.slug.toLowerCase();
            return (
              (catNameLower.includes('cart') && (textToMatch.includes('cart') || textToMatch.includes('anuidade') || textToMatch.includes('limite'))) ||
              (catNameLower.includes('empr') && (textToMatch.includes('empr') || textToMatch.includes('consignado') || textToMatch.includes('financiamento'))) ||
              (catNameLower.includes('dívida') && (textToMatch.includes('dívida') || textToMatch.includes('divida') || textToMatch.includes('orçamento') || textToMatch.includes('orcamento') || textToMatch.includes('renegocia') || textToMatch.includes('serasa') || textToMatch.includes('50/30/20'))) ||
              (catNameLower.includes('milha') && (textToMatch.includes('milha') || textToMatch.includes('ponto') || textToMatch.includes('renda') || textToMatch.includes('invest') || textToMatch.includes('tesouro') || textToMatch.includes('reserva'))) ||
              textToMatch.includes(catNameLower) ||
              textToMatch.includes(catSlugLower)
            );
          });

          if (!matched) {
            matched = blogCategories[0];
          }

          calendarCategory = matched;
          await adminSupabase
            .from('editorial_calendar')
            .update({ category_id: matched.id, updated_at: new Date().toISOString() })
            .eq('id', calendarId);

          logger.info('PipelineService', `Pauta "${calendarItem.proposed_title || calendarItem.topic}" associada à categoria "${matched.name}" (${matched.id})`);
        }
      }

      logger.info('PipelineService', `Iniciando execução da pauta: "${calendarItem.proposed_title}" [Categoria: ${calendarCategory?.name || 'Geral'}]`, {
        calendarId,
        categoryId: calendarCategory?.id,
        categoryName: calendarCategory?.name,
        triggeredBy: options.triggeredBy || 'manual',
      });

      // 2. Atualizar status da pauta para IN_PROGRESS
      await adminSupabase
        .from('editorial_calendar')
        .update({ status: 'IN_PROGRESS', updated_at: new Date().toISOString() })
        .eq('id', calendarId);

      // 3. Criar ou recuperar registro em content_items
      const tempSlug = (calendarItem.proposed_title || calendarItem.topic)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

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
            title: calendarItem.proposed_title || calendarItem.topic,
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

      // 4. ETAPA 1: Pesquisa Factual Prévia e Geração de Conteúdo com IA
      const researchService = new ResearchService();
      const currentDate = new Date().toISOString().split('T')[0];
      const keywords = calendarItem.keywords && calendarItem.keywords.length > 0
        ? calendarItem.keywords
        : [calendarItem.topic];

      const researchBrief = await researchService.conductResearch({
        title: calendarItem.topic,
        category: calendarCategory?.name || calendarItem.category_id || undefined,
        keywords,
        niche: blog?.niche || undefined,
        currentDate,
        language: 'pt-BR',
        contentId,
      });

      // Bloquear apenas em caso de contradição factual crítica explícita
      const hasCriticalFactualConflict = researchBrief.warnings.some(w =>
        w.toLowerCase().includes('conflito semântico') || w.toLowerCase().includes('divergência detectada')
      );

      if (hasCriticalFactualConflict) {
        logger.warn('PipelineService', `Pauta "${calendarItem.topic}" bloqueada por divergência factual crítica.`);
        await adminSupabase
          .from('editorial_calendar')
          .update({
            status: 'FAILED',
            notes: `FAIL-CLOSED: ${researchBrief.warnings.join('; ')}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', calendarId);
        throw new Error('Conflito factual crítico detectado entre fontes normativas. Revisão manual obrigatória.');
      }

      if (researchBrief.status === 'RESEARCH_REVIEW_REQUIRED') {
        logger.info('PipelineService', `Aviso editorial na pesquisa de "${calendarItem.topic}": ${researchBrief.warnings.join('; ') || 'Prosseguindo com salvaguardas editoriais'}`);
      }

      const aiProvider = createAIProvider();
      const generatedArticle = await aiProvider.generateArticle(calendarItem.topic, keywords, {
        niche: blog?.niche,
        audience: blog?.audience || undefined,
        language: calendarItem.language || blog?.default_language || 'pt-BR',
        category: calendarCategory?.name || undefined,
        notes: calendarItem.notes || undefined,
        currentDate,
        sourcesOrResearch: researchBrief.rawBriefingText,
      });

      // Salva o artigo gerado imediatamente (resiliência contra falhas subsequentes)
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

      // 5. ETAPA 2: Gerar Imagem de Destaque com IA (Não Bloqueante)
      let generatedImage: { imageUrl?: string; buffer?: Buffer; mimeType?: string; altText?: string; provider?: string } | null = null;
      let mediaAssetId: string | null = null;

      try {
        const imageProvider = createImageProvider();
        const nichePart = blog?.niche ? `Nicho: ${blog.niche}. ` : '';
        const audiencePart = blog?.audience ? `Público: ${blog.audience}. ` : '';
        const contextPart = generatedArticle.metaDescription ? `Contexto: ${generatedArticle.metaDescription.slice(0, 150)}. ` : '';
        const imagePrompt = `Professional editorial photograph for article "${generatedArticle.title}". ${nichePart}${audiencePart}${contextPart}Theme: ${calendarItem.topic || generatedArticle.title}. Realistic photography, natural lighting, clean composition, no text, no logo, no watermark, 16:9.`;
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
            logger.warn('PipelineService', `Aviso: Falha ao persistir no storage blog-assets: ${String(storageErr)}`);
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
          logger.warn('PipelineService', `Aviso: Falha ao salvar asset de imagem: ${mediaError.message}`);
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
        logger.warn('PipelineService', `Aviso: Falha na geração de imagem (não bloqueante): ${String(imageError)}`);
        await adminSupabase.from('system_logs').insert({
          level: 'warn',
          service: 'PipelineService',
          message: `Falha na geração de imagem (não bloqueante) para a pauta ${calendarId}: ${imageError instanceof Error ? imageError.message : String(imageError)}`,
          metadata: { calendarId, contentId, error: String(imageError) } as Json,
        });
      }

      // 6. ETAPA 3: Publicar no WordPress
      const blogDomain = blog?.domain
        ? (blog.domain.startsWith('http') ? blog.domain : `https://${blog.domain}`)
        : undefined;
      const publisher = createPublisherProvider({
        siteUrl: blogDomain || process.env.WORDPRESS_SITE_URL,
      });
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
          logger.warn('PipelineService', `Falha ao enviar mídia para WP: ${String(mediaErr)}`);
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
          logger.warn('PipelineService', `Falha ao enviar mídia para WP: ${String(mediaErr)}`);
        }
      }

      const publishResult = await publisher.publishArticle({
        title: generatedArticle.title,
        slug: generatedArticle.slug,
        content: generatedArticle.content,
        excerpt: generatedArticle.metaDescription,
        status: 'publish',
        categoryNames: calendarCategory ? [calendarCategory.name, calendarCategory.slug] : undefined,
        featuredMediaId: wpFeaturedMediaId,
      });

      const totalDuration = Date.now() - startTime;

      // 7. Atualizar status finais para 'PUBLISHED'
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

      // 8. Registrar métricas e logs
      await adminSupabase.from('ai_runs').insert({
        content_id: contentId,
        agent: options.triggeredBy === 'autopilot' ? 'AutopilotPipeline' : 'ExecuteNowPipeline',
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
        service: 'PipelineService',
        message: `Pipeline ponta a ponta executado com sucesso para a pauta "${calendarItem.proposed_title || calendarItem.topic}". Publicado no WordPress.`,
        metadata: {
          calendarId,
          contentId,
          wpPostId: publishResult.postId,
          wpUrl: publishResult.url,
          durationMs: totalDuration,
          triggeredBy: options.triggeredBy || 'manual',
          userId: options.userId,
        } as Json,
      });

      return {
        success: true,
        calendarId,
        contentId,
        wpUrl: publishResult.url,
        wpPostId: publishResult.postId,
        status: 'PUBLISHED',
        durationMs: totalDuration,
      };
    } catch (error: unknown) {
      const totalDuration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Erro inesperado ao executar pipeline da pauta.';
      logger.error('PipelineService', `Erro fatal: ${errorMessage}`, { error });

      try {
        await adminSupabase
          .from('editorial_calendar')
          .update({ status: 'FAILED', updated_at: new Date().toISOString() })
          .eq('id', calendarId);

        await adminSupabase.from('system_logs').insert({
          level: 'error',
          service: 'PipelineService',
          message: `Falha ao executar pipeline imediato da pauta ${calendarId}: ${errorMessage}`,
          metadata: {
            calendarId,
            error: errorMessage,
            durationMs: totalDuration,
            triggeredBy: options.triggeredBy || 'manual',
          } as Json,
        });
      } catch (logErr) {
        logger.error('PipelineService', `Falha ao persistir status FAILED: ${String(logErr)}`);
      }

      return {
        success: false,
        calendarId,
        status: 'FAILED',
        durationMs: totalDuration,
        error: errorMessage,
      };
    }
  }
}
