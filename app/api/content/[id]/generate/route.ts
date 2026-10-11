import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { createAIProvider } from '@/services/ai';
import { ResearchService } from '@/services/research';
import { AIProviderError } from '@/lib/errors/ai.errors';
import { logger } from '@/lib/logger';
import { LogService } from '@/services/log.service';

export const maxDuration = 60; // 60 segundos para Vercel Serverless

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const startTime = Date.now();
  let aiProvider: ReturnType<typeof createAIProvider> | null = null;

  try {
    // 1. Validar sessão do usuário
    const user = await requireAuth();

    const supabase = await getSupabaseServerClient();

    // 2. Buscar content_item e dados de pauta/editorial
    const { data: contentItem, error: contentError } = await supabase
      .from('content_items')
      .select('*, editorial_calendar(*), blog:blogs(*)')
      .eq('id', id)
      .maybeSingle();

    if (contentError || !contentItem) {
      logger.error('API.generate', `Artigo ${id} não encontrado`, { error: contentError });
      return NextResponse.json(
        { success: false, error: 'Artigo não encontrado.' },
        { status: 404 }
      );
    }

    const blog = contentItem.blog;
    const calendar = contentItem.editorial_calendar;

    const topic = calendar?.topic || contentItem.title;
    const keywords = (calendar?.keywords && calendar.keywords.length > 0)
      ? calendar.keywords
      : [contentItem.title];

    let requestLanguage: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.language === 'string') {
        requestLanguage = body.language;
      }
    } catch {
      // Body vazio ou sem payload JSON (retrocompatibilidade)
    }

    const targetLanguage = requestLanguage || contentItem.language || blog?.default_language || 'pt-BR';

    // 3. Instanciar AIProvider via Factory
    aiProvider = createAIProvider();

    logger.info('API.generate', `Iniciando geração de texto com ${aiProvider.name} em ${targetLanguage} para contentId: ${id}`);

    // 4. Executar pesquisa factual prévia via ResearchService
    const currentDate = new Date().toISOString().split('T')[0];
    const researchService = new ResearchService();
    const researchBrief = await researchService.conductResearch({
      title: topic,
      category: calendar?.category_id || undefined,
      keywords,
      niche: blog?.niche || undefined,
      currentDate,
      language: targetLanguage,
      contentId: id,
    });

    if (researchBrief.status === 'RESEARCH_REVIEW_REQUIRED') {
      logger.warn('API.generate', `Pesquisa factual para "${topic}" requer revisão manual (FAIL-CLOSED)`);
      return NextResponse.json(
        {
          success: false,
          error: 'Não foi possível verificar informações críticas desta pauta em fontes oficiais confiáveis.',
          status: 'RESEARCH_REVIEW_REQUIRED',
          brief: researchBrief,
        },
        { status: 422 }
      );
    }

    // 5. Executar geração do artigo entregando o FactualResearchBrief através de sourcesOrResearch
    const generated = await aiProvider.generateArticle(topic, keywords, {
      niche: blog?.niche,
      audience: blog?.audience || undefined,
      language: targetLanguage,
      category: calendar?.category_id || undefined,
      notes: calendar?.notes || undefined,
      currentDate,
      sourcesOrResearch: researchBrief.rawBriefingText,
    });

    const durationMs = Date.now() - startTime;

    // 5. Atualizar content_items no Supabase com novo texto, slug, meta_description, language e status 'ready'
    const { data: updatedItem, error: updateError } = await supabase
      .from('content_items')
      .update({
        title: generated.title,
        slug: generated.slug,
        meta_description: generated.metaDescription,
        body: generated.content,
        language: targetLanguage,
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, featured_image:media_assets!content_items_featured_image_id_fkey(*)')
      .single();

    if (updateError) {
      logger.error('API.generate', `Falha ao persistir artigo gerado ${id}`, { error: updateError });
      throw new Error(`Falha ao salvar conteúdo no banco: ${updateError.message}`);
    }

    // 6. Registrar execução em ai_runs
    await supabase.from('ai_runs').insert({
      content_id: id,
      agent: 'WriterAgent (Gemini)',
      provider: aiProvider.name,
      model: aiProvider.defaultModel,
      status: 'completed',
      input_summary: `Topic: ${topic} | Keywords: ${keywords.join(', ')}`,
      output_summary: `Gerado artigo com ${generated.content.length} caracteres e ${generated.readingTimeMinutes || 5} min de leitura.`,
      estimated_cost: 0.0015,
      duration_ms: durationMs,
    });

    // 7. Registrar em system_logs
    await LogService.recordLog(
      'info',
      'API.generate',
      `Artigo ${id} gerado com sucesso pelo ${aiProvider.name}`,
      { contentId: id, title: generated.title, durationMs, userId: user.id }
    );

    return NextResponse.json({
      success: true,
      data: updatedItem,
      message: 'Artigo gerado com sucesso!',
    });
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido na geração de artigo.';
    const statusCode = error instanceof AIProviderError ? (error.statusCode || 500) : 500;

    logger.error('API.generate', `Erro durante o processo de geração: ${errorMessage}`, { error });

    try {
      const supabase = await getSupabaseServerClient();
      await supabase.from('ai_runs').insert({
        content_id: id,
        agent: 'WriterAgent (Gemini)',
        provider: 'GeminiProvider',
        model: aiProvider?.defaultModel || 'gemini-3.6-flash',
        status: 'failed',
        error: errorMessage,
        duration_ms: durationMs,
        estimated_cost: 0,
      });
      await LogService.recordLog('error', 'API.generate', `Falha ao gerar artigo ${id}: ${errorMessage}`, { error });
    } catch (logErr) {
      logger.warn('API.generate', `Falha ao registrar log de erro: ${String(logErr)}`);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: statusCode }
    );
  }
}
