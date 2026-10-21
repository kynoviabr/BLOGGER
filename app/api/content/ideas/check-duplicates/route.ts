import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { logger } from '@/lib/logger';
import { CannibalizationGuardService, toGuardInput } from '@/services/editorial/cannibalization-guard.service';

/**
 * Verifica ideias geradas contra o conteúdo do MESMO blog (pautas, artigos e
 * posts do WordPress) e entre si, antes de o usuário escolher quais salvar.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const { blogId, ideas }: { blogId?: string; ideas?: Array<{ title: string; keywords?: string }> } = body;

    if (!blogId) {
      return NextResponse.json({ success: false, error: 'O ID do blog (blogId) é obrigatório.' }, { status: 400 });
    }
    if (!Array.isArray(ideas) || ideas.length === 0) {
      return NextResponse.json({ success: true, results: [] });
    }

    const checks = await CannibalizationGuardService.checkMany(blogId, ideas.slice(0, 50).map(toGuardInput));
    return NextResponse.json({
      success: true,
      results: checks.map((check) => ({
        riskLevel: check.riskLevel,
        score: check.score,
        conflict: check.conflictingItems[0] ?? null,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao verificar pautas duplicadas.';
    logger.error('API.ideas.check-duplicates', message, { error });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
