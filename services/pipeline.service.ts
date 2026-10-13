import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAIProvider, createImageProvider } from '@/services/ai';
import { ResearchService } from '@/services/research';
import { createPublisherProvider, createPublisherProviderForBlog } from '@/services/publisher';
import { MonetizationService } from '@/services/monetization';
import { logger } from '@/lib/logger';
import { Json } from '@/types/database';
import { validateEditorialScope } from '@/services/editorial/scope-guard';
import { InternalLinksService } from '@/services/editorial/internal-links.service';
import crypto from 'crypto';

export interface PipelineExecutionOptions {
  triggeredBy?: string;
  userId?: string;
  dryRun?: boolean;
  postStatus?: 'draft' | 'publish';
  language?: string;
}

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
    options: PipelineExecutionOptions = {}
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
      let calendarCategory = calendarItem.category as { id: string; name: string; slug: string } | null;

      // 1.1 Buscar categorias cadastradas do blog no banco
      const { data: blogCategories } = await adminSupabase
        .from('categories')
        .select('id, name, slug')
        .eq('blog_id', calendarItem.blog_id);

      // 1.2 Validação Prévia de Escopo Editorial (ScopeGuard multi-blog e multi-nicho)
      const scopeCheck = validateEditorialScope(
        calendarItem.proposed_title || calendarItem.topic,
        calendarItem.keywords || [],
        {
          blog,
          calendarCategory,
          availableCategories: blogCategories || [],
        }
      );

      if (!scopeCheck.isAllowed) {
        const rejectionMsg = `Pauta bloqueada pelo ScopeGuard: ${scopeCheck.reason}`;
        logger.warn('PipelineService', rejectionMsg, { calendarId, topic: calendarItem.topic });
        await adminSupabase
          .from('editorial_calendar')
          .update({
            status: 'FAILED',
            notes: rejectionMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', calendarId);

        throw new Error(rejectionMsg);
      }

      // 1.3 Resolver categoria oficial do blog
      let categorySlug: string = calendarCategory?.slug || scopeCheck.matchedCategorySlug || blogCategories?.[0]?.slug || 'geral';

      // Se calendarCategory não existia na pauta mas encontramos uma correspondente no blog, sincroniza
      if (!calendarCategory && blogCategories && blogCategories.length > 0) {
        const matchedDbCat = blogCategories.find((c) => c.slug.toLowerCase() === categorySlug.toLowerCase()) || blogCategories[0];
        if (matchedDbCat) {
          calendarCategory = matchedDbCat;
          categorySlug = matchedDbCat.slug;
          if (calendarItem.category_id !== matchedDbCat.id) {
            await adminSupabase
              .from('editorial_calendar')
              .update({ category_id: matchedDbCat.id, updated_at: new Date().toISOString() })
              .eq('id', calendarId);
          }
        }
      }

      logger.info('PipelineService', `Iniciando execução da pauta: "${calendarItem.proposed_title}" [Categoria Oficial: ${categorySlug}]`, {
        calendarId,
        categorySlug,
        triggeredBy: options.triggeredBy || 'manual',
        dryRun: !!options.dryRun,
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

      const itemLanguage = options.language || calendarItem.language || blog?.default_language || 'pt-BR';

      if (options.language && options.language !== calendarItem.language) {
        await adminSupabase
          .from('editorial_calendar')
          .update({ language: options.language, updated_at: new Date().toISOString() })
          .eq('id', calendarId);
      }

      let contentId: string;

      if (existingContent) {
        contentId = existingContent.id;
      } else {
        const { data: newContent, error: contentInsertError } = await adminSupabase
          .from('content_items')
          .insert({
            blog_id: calendarItem.blog_id,
            editorial_calendar_id: calendarId,
            language: itemLanguage,
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
        category: calendarCategory?.name || categorySlug,
        keywords,
        niche: blog?.niche || undefined,
        currentDate,
        language: itemLanguage,
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

      // 4.1. Buscar ofertas determinísticas de monetização para a categoria do artigo
      const monetizationOffers = blog?.id
        ? await MonetizationService.getOffersForCategory(
            blog.id,
            calendarCategory?.slug || calendarCategory?.id || categorySlug
          )
        : [];

      // 4.2. Buscar artigos já publicados para linkagem interna determinística
      const internalLinks = blog?.id
        ? await InternalLinksService.getPublishedArticlesForInternalLinking(blog.id, {
            currentArticleId: contentId,
            categorySlug,
            limit: 15,
          })
        : [];

      const aiProvider = createAIProvider();
      const generatedArticle = await aiProvider.generateArticle(calendarItem.topic, keywords, {
        blogName: blog?.name,
        niche: blog?.niche,
        audience: blog?.audience || undefined,
        language: itemLanguage,
        category: calendarCategory?.name || categorySlug,
        notes: calendarItem.notes || undefined,
        currentDate,
        sourcesOrResearch: researchBrief.rawBriefingText,
        monetizationOffers,
        internalLinks,
      });

      // Salva o artigo gerado imediatamente (resiliência contra falhas subsequentes e cache de schema)
      const contentUpdatePayload: Record<string, unknown> = {
        title: generatedArticle.title,
        slug: generatedArticle.slug,
        body: generatedArticle.content,
        language: itemLanguage,
        status: 'ready',
        updated_at: new Date().toISOString(),
      };
      if (generatedArticle.metaDescription) {
        contentUpdatePayload.meta_description = generatedArticle.metaDescription;
      }
      if (generatedArticle.focusKeyword || keywords[0]) {
        contentUpdatePayload.focus_keyword = generatedArticle.focusKeyword || keywords[0];
      }
      if (generatedArticle.tags && generatedArticle.tags.length > 0) {
        contentUpdatePayload.tags = generatedArticle.tags;
      }

      const { error: contentSaveErr } = await adminSupabase
        .from('content_items')
        .update(contentUpdatePayload as any)
        .eq('id', contentId);

      if (contentSaveErr) {
        logger.warn('PipelineService', `Aviso ao salvar com metadados de SEO em content_items: ${contentSaveErr.message}. Salvando corpo e título.`);
        await adminSupabase
          .from('content_items')
          .update({
            title: generatedArticle.title,
            slug: generatedArticle.slug,
            body: generatedArticle.content,
            language: itemLanguage,
            status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', contentId);
      }

      // 5. ETAPA 2: Gerar Imagem de Destaque com IA (Obrigatória - Proibido publicar sem imagem)
      let generatedImage: { imageUrl?: string; buffer?: Buffer; mimeType?: string; altText?: string; provider?: string } | null = null;
      let mediaAssetId: string | null = null;

      try {
        const imageProvider = createImageProvider();
        
        // Prioriza o imagePrompt gerado pela IA com direção de arte e rotação de estilos visuais
        const fallbackPrompt = `Conceptual editorial photography, minimalist still life representing financial growth and balance for "${generatedArticle.title}". High quality, rich textures, dramatic studio lighting, shallow depth of field, 8k, hyper-detailed, clean composition, no text, no logos, no watermarks, no screens, no laptops, no smartphones, no office desks`;
        const imagePrompt = (generatedArticle.imagePrompt && generatedArticle.imagePrompt.trim().length > 10)
          ? generatedArticle.imagePrompt.trim()
          : fallbackPrompt;
        
        const imgResult = await imageProvider.generateFeaturedImage(imagePrompt, {
          aspectRatio: '16:9',
          style: 'editorial',
        });

        // Verificação de buffer e hash SHA-256 para prevenir imagens repetidas
        let imageBuffer = imgResult.buffer;
        if (!imageBuffer && imgResult.imageUrl) {
          const fetchRes = await fetch(imgResult.imageUrl);
          if (fetchRes.ok) {
            imageBuffer = Buffer.from(await fetchRes.arrayBuffer());
          }
        }

        if (!imageBuffer) {
          throw new Error('Buffer da imagem gerada indisponível.');
        }

        const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
        logger.info('PipelineService', `Imagem de destaque gerada com sucesso. Hash SHA-256: ${imageHash.slice(0, 16)}...`);

        // Alt text descritivo em português do Brasil
        const cleanAltText = (imgResult.altText || `Ilustração editorial sobre ${generatedArticle.title}`).slice(0, 120);

        generatedImage = {
          ...imgResult,
          buffer: imageBuffer,
          altText: cleanAltText,
        };

        let storagePath = imgResult.imageUrl;
        let publicUrl = imgResult.imageUrl;

        // Upload server-side para o bucket blog-assets
        const ext = imgResult.mimeType === 'image/png' ? 'png' : imgResult.mimeType === 'image/webp' ? 'webp' : 'jpg';
        const filePath = `${calendarItem.blog_id}/${contentId}/${generatedArticle.slug}.${ext}`;
        const { data: uploadData, error: uploadErr } = await adminSupabase.storage
          .from('blog-assets')
          .upload(filePath, imageBuffer, {
            contentType: imgResult.mimeType || 'image/jpeg',
            upsert: true,
          });

        if (!uploadErr && uploadData) {
          storagePath = uploadData.path;
          const { data: pubUrlData } = adminSupabase.storage
            .from('blog-assets')
            .getPublicUrl(uploadData.path);
          publicUrl = pubUrlData.publicUrl;
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
            alt_text: cleanAltText,
            prompt: imagePrompt,
            provider: imgResult.provider,
          })
          .select()
          .single();

        if (!mediaError && insertedAsset) {
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
        const imgErrMsg = `Falha obrigatória na geração de imagem de destaque: ${imageError instanceof Error ? imageError.message : String(imageError)}`;
        logger.error('PipelineService', imgErrMsg);
        throw new Error(imgErrMsg);
      }

      // 6. ETAPA 3: Publicar no WordPress
      const publisher = createPublisherProviderForBlog(blog);

      let wpFeaturedMediaId: string | number | undefined;

      if (generatedImage?.buffer) {
        try {
          const mimeType = generatedImage.mimeType || 'image/jpeg';
          const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
          const fileName = `${generatedArticle.slug}.${ext}`;

          const mediaUploadResult = await publisher.uploadMedia({
            fileName,
            mimeType,
            data: generatedImage.buffer,
            title: generatedArticle.title,
            altText: generatedImage.altText || generatedArticle.title,
          });
          wpFeaturedMediaId = mediaUploadResult.mediaId;
        } catch (mediaErr) {
          throw new Error(`Falha crítica ao enviar imagem destacada para o WordPress: ${String(mediaErr)}`);
        }
      }

      if (!wpFeaturedMediaId && !options.dryRun) {
        throw new Error('Nenhuma imagem destacada (featured_media) foi vinculada. Publicação interrompida por salvaguarda editorial.');
      }

      const publishResult = await publisher.publishArticle({
        title: generatedArticle.title,
        slug: generatedArticle.slug,
        content: generatedArticle.content,
        excerpt: generatedArticle.metaDescription,
        status: options.postStatus || 'publish',
        categorySlug,
        featuredMediaId: wpFeaturedMediaId,
        metaTitle: generatedArticle.title,
        metaDescription: generatedArticle.metaDescription,
        primaryKeyword: keywords[0],
        focusKeyword: generatedArticle.focusKeyword || keywords[0],
        tagNames: generatedArticle.tags || keywords.slice(0, 5),
        language: itemLanguage,
        dryRun: options.dryRun,
        offers: monetizationOffers,
        blogName: blog?.name,
        niche: blog?.niche,
        customDisclaimer: (blog?.editorial_config as Record<string, unknown>)?.disclaimer_html as string | undefined,
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
