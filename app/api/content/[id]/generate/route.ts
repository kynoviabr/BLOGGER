import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const idempotencyKey = `content-generation:${id}:${contentItem.updated_at}`.slice(0, 200);
    const { data: job, error: enqueueError } = await supabase.rpc('enqueue_background_job', {
      p_job_type: 'content_pipeline',
      p_payload: { contentId: id, language: targetLanguage, requestedBy: user.id },
      p_organization_id: blog?.organization_id,
      p_blog_id: contentItem.blog_id,
      p_idempotency_key: idempotencyKey,
      p_priority: 50,
      p_max_attempts: 3,
    });
    if (enqueueError || !job) throw new Error(enqueueError?.message || 'Falha ao enfileirar geração.');
    logger.info('API.generate', `Geração ${job.id} enfileirada no Supabase`, { contentId: id, userId: user.id });
    return NextResponse.json({ success: true, queued: true, jobId: job.id, status: job.status }, { status: 202 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido na geração de artigo.';
    logger.error('API.generate', `Erro durante o processo de geração: ${errorMessage}`, { error });
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
