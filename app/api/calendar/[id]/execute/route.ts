import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { PipelineService } from '@/services/pipeline.service';

export const maxDuration = 60; // 60 segundos para execução completa do pipeline

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: calendarId } = await params;

  try {
    // 1. Validar sessão do usuário
    const user = await requireAuth();

    // 2. Executar o pipeline completo
    const result = await PipelineService.executeItem(calendarId, {
      userId: user.id,
      triggeredBy: 'manual-ui',
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Falha ao executar pipeline.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Pipeline executado com sucesso! Artigo publicado no WordPress.',
      data: result,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro não autenticado ou inesperado.';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 401 }
    );
  }
}
