import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

// "Atualizar antes de publicar": pesquisa de novo e reescreve o texto, mantendo a
// imagem. O artigo volta para Revisão e precisa ser aprovado outra vez.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requireAuth();
    const supabase = await getSupabaseServerClient();
    const { data: item, error } = await supabase
      .from('content_items')
      .select('id, blog_id, status, language, editorial_calendar_id, blog:blogs(organization_id)')
      .eq('id', id)
      .maybeSingle();
    if (error || !item) return NextResponse.json({ success: false, error: 'Artigo não encontrado.' }, { status: 404 });
    if (item.status === 'published' || item.status === 'publishing') {
      return NextResponse.json({ success: false, error: 'Este artigo já foi publicado.' }, { status: 409 });
    }
    const blog = (Array.isArray(item.blog) ? item.blog[0] : item.blog) as { organization_id?: string } | null;

    // A atualização passa pelo RLS do usuário: só quem pode editar o artigo chega aqui.
    const { data: updated, error: updateError } = await supabase
      .from('content_items')
      .update({ status: 'researching', research_status: null, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (updateError || !updated) {
      return NextResponse.json({ success: false, error: updateError?.message || 'Sem permissão para editar este artigo.' }, { status: 403 });
    }
    const admin = getSupabaseAdminClient();
    await admin.from('content_sources').delete().eq('content_id', id);

    const refreshTag = `refresh-${Date.now()}`;
    const { data: job, error: enqueueError } = await supabase.rpc('enqueue_background_job', {
      p_job_type: 'content_pipeline',
      p_payload: { contentId: id, calendarId: item.editorial_calendar_id, language: item.language || 'pt-BR', requestedBy: user.id, refreshTag },
      p_organization_id: blog?.organization_id,
      p_blog_id: item.blog_id,
      p_idempotency_key: `content-refresh:${id}:${refreshTag}`,
      p_priority: 40,
      p_max_attempts: 3,
    } as never);
    if (enqueueError || !job) {
      await admin.from('content_items').update({ status: 'reviewing' }).eq('id', id).eq('status', 'researching');
      throw new Error(enqueueError?.message || 'Falha ao enfileirar a atualização.');
    }
    logger.info('API.content.refresh', `Atualização do artigo ${id} enfileirada`, { userId: user.id });
    return NextResponse.json({ success: true, jobId: (job as { id: string }).id }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Não foi possível atualizar o artigo.';
    logger.error('API.content.refresh', message, { err, id });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
