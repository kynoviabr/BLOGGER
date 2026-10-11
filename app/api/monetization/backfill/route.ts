import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { MonetizationBackfillService } from '@/services/monetization/monetization-backfill.service';
import { logger } from '@/lib/logger';

export const maxDuration = 60; // 60 segundos para processamento em lote na Vercel

export async function POST(request: NextRequest) {
  try {
    // 1. Validar autenticação
    await requireAuth();

    // 2. Extrair parâmetros
    const body = await request.json().catch(() => ({}));
    const {
      blogId,
      articleId,
      forceUpdateExisting = true,
      syncWordPress = true,
      statusFilter = ['published', 'ready', 'draft'],
    } = body;

    if (!blogId && !articleId) {
      return NextResponse.json(
        {
          success: false,
          error: 'É obrigatório fornecer "blogId" para retroalimentação em lote ou "articleId" para artigo individual.',
        },
        { status: 400 }
      );
    }

    // 3. Execução individual
    if (articleId) {
      logger.info('API.MonetizationBackfill', `Executando backfill para artigo ${articleId}`, {
        forceUpdateExisting,
        syncWordPress,
      });

      const result = await MonetizationBackfillService.backfillSingleArticle(articleId, {
        forceUpdateExisting,
        syncWordPress,
      });

      return NextResponse.json({
        success: result.supabaseUpdated,
        data: result,
      });
    }

    // 4. Execução em lote para o Blog
    logger.info('API.MonetizationBackfill', `Executando backfill em lote para o blog ${blogId}`, {
      forceUpdateExisting,
      syncWordPress,
      statusFilter,
    });

    const batchResult = await MonetizationBackfillService.backfillBlogArticles(blogId, {
      forceUpdateExisting,
      syncWordPress,
      statusFilter,
    });

    return NextResponse.json({
      success: true,
      data: batchResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('API.MonetizationBackfill', `Erro ao processar backfill de monetização: ${message}`, { error: err });

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
