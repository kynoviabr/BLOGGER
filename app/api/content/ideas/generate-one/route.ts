import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAIProvider } from '@/services/ai';
import { logger } from '@/lib/logger';
import { LogService } from '@/services/log.service';
import { ExistingIdeaSummary } from '@/types/ideas';
import { validateEditorialScope } from '@/services/editorial/scope-guard';
import { CannibalizationGuardService, toGuardInput } from '@/services/editorial/cannibalization-guard.service';
import { MAX_EXISTING_IDEAS_IN_PROMPT } from '@/services/ai/ai-provider.interface';

export const maxDuration = 60;

/** Tentativas extras quando a pauta gerada se parece demais com algo que o blog já tem. */
const MAX_REGENERATIONS = 2;
/** Não começa uma nova tentativa depois deste tempo, para caber no limite da função. */
const REGENERATION_BUDGET_MS = 30_000;
/** A partir deste valor a pauta é parecida (badge "Parecida") e vale tentar outra. */
const SIMILAR_THRESHOLD = 0.5;

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const user = await requireAuth();

    const body = await request.json();
    const {
      blogId,
      category,
      language,
      existingIdeas = [],
      queuePosition = 1,
      totalRequested = 1,
    }: {
      blogId: string;
      category?: string;
      language?: string;
      existingIdeas?: ExistingIdeaSummary[];
      queuePosition?: number;
      totalRequested?: number;
    } = body;

    if (!blogId) {
      return NextResponse.json(
        { success: false, error: 'O ID do blog (blogId) é obrigatório.' },
        { status: 400 }
      );
    }

    const adminSupabase = getSupabaseAdminClient();

    // 1. Buscar contexto do blog no banco
    const { data: blog, error: blogError } = await adminSupabase
      .from('blogs')
      .select('id, name, niche, audience, description, default_language')
      .eq('id', blogId)
      .maybeSingle();

    if (blogError || !blog) {
      return NextResponse.json(
        { success: false, error: 'Blog não encontrado no banco de dados.' },
        { status: 404 }
      );
    }

    // 2. Tudo o que o blog já tem (pautas, artigos e posts do WordPress), para a IA
    // não repetir assuntos e para conferir a pauta gerada antes de devolvê-la.
    const corpus = await CannibalizationGuardService.loadBlogCorpus(blogId);
    for (const idea of existingIdeas) {
      corpus.push(CannibalizationGuardService.buildEntry('BATCH', idea.title, idea.keywords ?? '', { status: 'NEW' }));
    }

    const seenTitles = new Set<string>();
    const blogTitles: ExistingIdeaSummary[] = [];
    for (const entry of corpus) {
      if (entry.source === 'BATCH' || !entry.title || seenTitles.has(entry.normTitle)) continue;
      seenTitles.add(entry.normTitle);
      blogTitles.push({ title: entry.title });
    }

    // As ideias desta sessão ficam no fim, porque o prompt mantém os últimos itens da lista.
    const combinedExisting: ExistingIdeaSummary[] = [
      ...blogTitles.slice(0, MAX_EXISTING_IDEAS_IN_PROMPT - existingIdeas.length).reverse(),
      ...existingIdeas,
    ];

    // Buscar categorias ativas deste blog
    const { data: blogCategories } = await adminSupabase
      .from('categories')
      .select('id, name, slug')
      .eq('blog_id', blogId);

    const availableCategories = (blogCategories || []).map((c) => c.name);

    // Determina a categoria alvo: se o usuário escolheu "Todas as categorias" (ou não especificou),
    // distribui de forma estritamente rotacionada (Round-Robin) entre as categorias do blog.
    let targetCategory = category && category !== 'all' ? category : undefined;
    if (!targetCategory && availableCategories.length > 0) {
      const catIndex = (Math.max(1, queuePosition) - 1) % availableCategories.length;
      targetCategory = availableCategories[catIndex];
    }

    // 3. Chamar AIProvider para gerar EXATAMENTE UMA pauta com modelo rápido
    const aiProvider = createAIProvider();

    if (!aiProvider.generateIdea) {
      throw new Error('O provedor de IA atual não implementa geração unitária de ideias.');
    }

    const generateIdea = aiProvider.generateIdea.bind(aiProvider);
    const avoid = [...combinedExisting];
    let idea: Awaited<ReturnType<typeof generateIdea>> | null = null;
    let bestScore = Infinity;

    // Se a pauta sair parecida com algo do blog, pede outra (até MAX_REGENERATIONS vezes),
    // avisando a IA do conflito, e devolve a menos parecida.
    for (let attempt = 0; attempt <= MAX_REGENERATIONS; attempt++) {
      if (attempt > 0 && Date.now() - startTime > REGENERATION_BUDGET_MS) break;

      const candidate = await generateIdea({
        niche: blog.niche || 'Geral',
        audience: blog.audience || 'Público leitor interessado no tema',
        purpose: blog.description || 'Conteúdo editorial informativo com alta credibilidade e precisão técnica',
        category: targetCategory,
        availableCategories: availableCategories.length > 0 ? availableCategories : undefined,
        language: language || blog.default_language || 'pt-BR',
        blogName: blog.name,
        currentDate: new Date().toISOString().split('T')[0],
        existingIdeas: avoid,
        queuePosition,
        totalRequested,
      });
      if (!candidate?.title) continue;

      const check = CannibalizationGuardService.scoreAgainst(corpus, toGuardInput(candidate));
      if (check.score < bestScore) {
        idea = candidate;
        bestScore = check.score;
      }
      if (check.score < SIMILAR_THRESHOLD) break;

      logger.warn('API.ideas.generateOne', `Pauta "${candidate.title}" parecida (${Math.round(check.score * 100)}%) com "${check.conflictingItems[0]?.title}". Gerando outra.`);
      avoid.push({ title: candidate.title, keywords: candidate.keywords });
    }

    // 4. Validação estrita dos campos da ideia
    if (!idea || !idea.title || idea.title.length < 5) {
      throw new Error('A IA retornou uma pauta vazia ou com título inválido.');
    }

    // 4.1 Validação de escopo editorial compatível com o blog
    const scopeCheck = validateEditorialScope(
      idea.title,
      idea.keywords ? idea.keywords.split(',') : [],
      {
        blog,
        calendarCategory: targetCategory ? { name: targetCategory } : undefined,
        availableCategories: blogCategories || [],
      }
    );

    // Garante a categoria atribuída pela rota/fila ou definida pela IA
    const finalCategory = targetCategory || idea.category || availableCategories[0] || 'Geral';

    if (!scopeCheck.isAllowed) {
      logger.warn('API.ideas.generateOne', `Pauta gerada fora do escopo estrito: "${idea.title}".`);
    }
    const durationMs = Date.now() - startTime;
    const modelUsed = (aiProvider as { defaultModel?: string }).defaultModel || process.env.GEMINI_IDEAS_MODEL || 'gemini-2.5-flash';

    await LogService.recordLog(
      'info',
      'API.ideas.generateOne',
      `Pauta ${queuePosition}/${totalRequested} gerada com sucesso: "${idea.title.slice(0, 50)}..." [Categoria: ${finalCategory}]`,
      {
        blogId,
        category: finalCategory,
        queuePosition,
        totalRequested,
        model: modelUsed,
        durationMs,
        success: true,
        userId: user.id,
      }
    );

    return NextResponse.json({
      success: true,
      idea: {
        title: idea.title,
        keywords: idea.keywords,
        description: idea.description,
        type: idea.type,
        category: finalCategory,
      },
      queuePosition,
      durationMs,
    });
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar pauta individual.';
    logger.error('API.ideas.generateOne', `Falha ao gerar pauta: ${errorMessage}`, { error });

    try {
      await LogService.recordLog(
        'warn',
        'API.ideas.generateOne',
        `Falha ao gerar pauta individual: ${errorMessage}`,
        { durationMs, success: false }
      );
    } catch {
      // Ignora erro de gravação de log secundário
    }

    return NextResponse.json(
      { success: false, error: errorMessage, durationMs },
      { status: 500 }
    );
  }
}
