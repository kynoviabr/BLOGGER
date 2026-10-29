import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export const maxDuration = 10;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const user = await requireAuth();
    const supabase = await getSupabaseServerClient();

    const { data: contentItem, error: contentError } = await supabase
      .from('content_items')
      .select('*, blog:blogs(*)')
      .eq('id', id)
      .maybeSingle();

    if (contentError || !contentItem) {
      return NextResponse.json({ success: false, error: 'Artigo não encontrado.' }, { status: 404 });
    }

    let prompt: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.prompt === 'string' && body.prompt.trim().length > 10) prompt = body.prompt.trim();
    } catch {}

    // Cada clique pede uma imagem nova; a chave só evita duplicar cliques no mesmo instante.
    const idempotencyKey = `image-generation:${id}:manual:${Math.floor(Date.now() / 5000)}`.slice(0, 200);
    const { data: job, error: enqueueError } = await supabase.rpc('enqueue_background_job', {
      p_job_type: 'image_generation',
      p_payload: { contentId: id, prompt, requestedBy: user.id, regenerate: true },
      p_organization_id: (contentItem.blog as { organization_id?: string } | null)?.organization_id,
      p_blog_id: contentItem.blog_id,
      p_idempotency_key: idempotencyKey,
      // Alguém está esperando na tela: passa na frente de pesquisas e artigos na fila.
      p_priority: 30,
      p_max_attempts: 3,
    } as never);

    if (enqueueError || !job) throw new Error((enqueueError as { message?: string } | null)?.message || 'Falha ao enfileirar geração de imagem.');
    const typedJob = job as unknown as { id: string; status: string };
    logger.info('API.image', `Imagem ${typedJob.id} enfileirada`, { contentId: id, userId: user.id });
    return NextResponse.json({ success: true, queued: true, jobId: typedJob.id, status: typedJob.status }, { status: 202 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao enfileirar imagem.';
    logger.error('API.image', msg, { error });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
