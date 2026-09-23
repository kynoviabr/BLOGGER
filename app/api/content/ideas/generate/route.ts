import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAIProvider } from '@/services/ai';
import { logger } from '@/lib/logger';
import { LogService } from '@/services/log.service';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const user = await requireAuth();

    const body = await request.json();
    const { blogId, category, count } = body;

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
      .select('*')
      .eq('id', blogId)
      .maybeSingle();

    if (blogError || !blog) {
      return NextResponse.json(
        { success: false, error: 'Blog não encontrado no banco de dados.' },
        { status: 404 }
      );
    }

    // 2. Chamar o AIProvider para gerar ideias estruturadas
    const aiProvider = createAIProvider();

    if (!aiProvider.generateIdeas) {
      throw new Error('O provedor de IA atual não implementa geração de ideias estruturadas.');
    }

    const ideas = await aiProvider.generateIdeas({
      niche: blog.niche || 'Finanças Pessoais',
      audience: blog.audience || 'Público interessado em finanças, economia e crédito',
      purpose: blog.description || 'Educação financeira com alta credibilidade e precisão técnica',
      category: category || undefined,
      language: blog.default_language || 'pt-BR',
      count: count ? Number(count) : 7,
    });

    const durationMs = Date.now() - startTime;

    await LogService.recordLog(
      'info',
      'API.ideas.generate',
      `Geradas ${ideas.length} ideias de pautas para o blog "${blog.name}"`,
      { blogId, category, count: ideas.length, durationMs, userId: user.id }
    );

    return NextResponse.json({
      success: true,
      ideas,
    });
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar ideias de pautas.';
    logger.error('API.ideas.generate', `Falha ao gerar ideias: ${errorMessage}`, { error });

    return NextResponse.json(
      { success: false, error: errorMessage, durationMs },
      { status: 500 }
    );
  }
}
