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

    let requestLanguage: string | undefined;
    let requestImageMode: 'auto' | 'inspect' | undefined;
    let requestSkipInspection: boolean | undefined;

    try {
      const body = await request.json();
      if (body) {
        if (typeof body.language === 'string') requestLanguage = body.language;
        if (body.imageMode === 'auto' || body.imageMode === 'inspect') requestImageMode = body.imageMode;
        if (typeof body.skipInspection === 'boolean') requestSkipInspection = body.skipInspection;
      }
    } catch {
      // Body vazio (chamada tradicional sem payload)
    }

    // 2. Executar o pipeline completo
    const result = await PipelineService.executeItem(calendarId, {
      userId: user.id,
      triggeredBy: 'manual-ui',
      language: requestLanguage,
      imageMode: requestImageMode,
      skipInspection: requestSkipInspection,
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
