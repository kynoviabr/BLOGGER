import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAIProvider } from '@/services/ai';
import { logger } from '@/lib/logger';
import { LogService } from '@/services/log.service';
import { ExistingIdeaSummary } from '@/types/ideas';
import { validateEditorialScope } from '@/services/editorial/scope-guard';

export const maxDuration = 45;

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

    // 2. Buscar pautas recentes já salvas no calendário do blog para evitar duplicidades temáticas
    const { data: recentCalendarItems } = await adminSupabase
      .from('editorial_calendar')
      .select('proposed_title, topic')
      .eq('blog_id', blogId)
      .order('created_at', { ascending: false })
      .limit(15);

    const calendarTitles: ExistingIdeaSummary[] = (recentCalendarItems || []).map((c) => ({
      title: c.proposed_title || c.topic,
    }));

    // Combina pautas já no calendário com as pautas geradas na fila da sessão atual
    const combinedExisting: ExistingIdeaSummary[] = [...calendarTitles, ...existingIdeas];

    // Buscar categorias ativas deste blog
    const { data: blogCategories } = await adminSupabase
      .from('categories')
      .select('name')
      .eq('blog_id', blogId);

    const availableCategories = (blogCategories || []).map((c) => c.name);

    // 3. Chamar AIProvider para gerar EXATAMENTE UMA pauta com modelo rápido
    const aiProvider = createAIProvider();

    if (!aiProvider.generateIdea) {
      throw new Error('O provedor de IA atual não implementa geração unitária de ideias.');
    }

    const idea = await aiProvider.generateIdea({
      niche: blog.niche || 'Finanças Pessoais',
      audience: blog.audience || 'Público interessado em finanças, economia e crédito',
      purpose: blog.description || 'Educação financeira com alta credibilidade e precisão técnica',
      category: category || undefined,
      availableCategories: availableCategories.length > 0 ? availableCategories : undefined,
      language: language || blog.default_language || 'pt-BR',
      blogName: blog.name,
      currentDate: new Date().toISOString().split('T')[0],
      existingIdeas: combinedExisting,
      queuePosition,
      totalRequested,
    });

    // 4. Validação estrita dos campos da ideia
    if (!idea || !idea.title || idea.title.length < 5) {
      throw new Error('A IA retornou uma pauta vazia ou com título inválido.');
    }

    // 4.1 Validação de escopo editorial (bloqueio de temas fora de Finanças)
    const scopeCheck = validateEditorialScope(idea.title, idea.keywords ? idea.keywords.split(',') : []);
    let finalCategory = idea.category || category || availableCategories[0] || 'Geral';

    if (scopeCheck.isAllowed && scopeCheck.matchedCategoryName) {
      finalCategory = scopeCheck.matchedCategoryName;
    } else if (!scopeCheck.isAllowed) {
      logger.warn('API.ideas.generateOne', `Pauta gerada fora do escopo estrito: "${idea.title}". Ajustando categoria com base em Finanças.`);
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
