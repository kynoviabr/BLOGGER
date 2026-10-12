import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { ContentIdea } from '@/types/ideas';
import { logger } from '@/lib/logger';
import { LogService } from '@/services/log.service';
import { validateEditorialScope } from '@/services/editorial/scope-guard';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await request.json();
    const { blogId, category, ideas }: { blogId: string; category?: string; ideas: ContentIdea[] } = body;

    if (!blogId) {
      return NextResponse.json(
        { success: false, error: 'O ID do blog (blogId) é obrigatório.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(ideas) || ideas.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nenhuma ideia selecionada para adicionar ao calendário.' },
        { status: 400 }
      );
    }

    const adminSupabase = getSupabaseAdminClient();

    // 1. Buscar todas as categorias disponíveis do blog
    const { data: blogCategories } = await adminSupabase
      .from('categories')
      .select('id, name, slug')
      .eq('blog_id', blogId);

    const categoriesList = blogCategories || [];

    // Função auxiliar para resolver a melhor categoria para uma ideia
    const resolveCategoryIdForIdea = (idea: ContentIdea): string | null => {
      if (categoriesList.length === 0) return null;

      // 1. Validação estrita por ScopeGuard
      const parsedKeywords = idea.keywords
        ? idea.keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : [];
      const scopeCheck = validateEditorialScope(idea.title, parsedKeywords, {
        availableCategories: categoriesList,
      });

      if (scopeCheck.isAllowed && scopeCheck.matchedCategorySlug) {
        const found = categoriesList.find((c) => c.slug.toLowerCase() === scopeCheck.matchedCategorySlug);
        if (found) return found.id;
      }

      const targetCatName = (idea.category || category || '').trim().toLowerCase();

      if (targetCatName) {
        const found = categoriesList.find((c) =>
          c.name.toLowerCase() === targetCatName ||
          c.slug.toLowerCase() === targetCatName
        );
        if (found) return found.id;
      }

      return categoriesList[0].id;
    };

    // 2. Buscar idioma padrão do blog
    const { data: blog } = await adminSupabase
      .from('blogs')
      .select('default_language')
      .eq('id', blogId)
      .maybeSingle();

    const language = blog?.default_language || 'pt-BR';

    // 3. Montar inserts para a tabela editorial_calendar com status 'PLANNED'
    const recordsToInsert = ideas.map((idea, index) => {
      // Agenda para dias subsequentes a partir de hoje
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + index + 1);

      const parsedKeywords = idea.keywords
        ? idea.keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : [];

      const ideaCategoryId = resolveCategoryIdForIdea(idea);

      return {
        blog_id: blogId,
        category_id: ideaCategoryId,
        language,
        topic: idea.title,
        proposed_title: idea.title,
        keywords: parsedKeywords,
        article_type: idea.type || 'Artigo Padrão',
        scheduled_at: scheduledDate.toISOString(),
        priority: 'medium' as const,
        status: 'PLANNED' as const,
        notes: idea.description || null,
      };
    });

    const { data: inserted, error: insertError } = await adminSupabase
      .from('editorial_calendar')
      .insert(recordsToInsert)
      .select();

    if (insertError) {
      logger.error('API.ideas.batch', `Falha ao inserir pautas no Supabase: ${insertError.message}`, { error: insertError });
      throw new Error(`Erro ao salvar pautas no calendário: ${insertError.message}`);
    }

    await LogService.recordLog(
      'info',
      'API.ideas.batch',
      `Inseridas ${inserted.length} pautas com sucesso no Calendário Editorial`,
      { blogId, count: inserted.length, userId: user.id }
    );

    return NextResponse.json({
      success: true,
      count: inserted.length,
      data: inserted,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar ideias no calendário.';
    logger.error('API.ideas.batch', errorMessage, { error });

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
