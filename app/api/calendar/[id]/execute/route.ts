import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export const maxDuration = 10;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: calendarId } = await params;
  try {
    const user = await requireAuth();
    const supabase = await getSupabaseServerClient();

    const { data: cal, error } = await supabase.from('editorial_calendar').select('id, blog_id, language, blogs!inner(organization_id)').eq('id', calendarId).maybeSingle();
    if (error || !cal) return NextResponse.json({ success: false, error: 'Pauta não encontrada.' }, { status: 404 });
    const blog = (cal as unknown as { blogs: { organization_id: string } }).blogs;
    const organizationId = blog.organization_id;

    // Find or create draft content_item for this calendar item, then enqueue content_pipeline
    let contentId: string | null = null;
    const { data: existing } = await supabase.from('content_items').select('id').eq('editorial_calendar_id', calendarId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) contentId = (existing as { id: string }).id;
    else {
      const { data: inserted, error: insErr } = await supabase.from('content_items').insert({
        blog_id: (cal as unknown as { blog_id: string }).blog_id,
        editorial_calendar_id: calendarId,
        title: 'Gerando...',
        slug: `generating-${Date.now()}`,
        body: '',
        status: 'draft',
        language: (cal as unknown as { language?: string | null }).language || 'pt-BR',
      }).select('id').single();
      if (insErr || !inserted) throw new Error(insErr?.message || 'Falha ao criar content_item para enqueue.');
      contentId = (inserted as { id: string }).id;
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const calLanguage = (cal as unknown as { language?: string | null }).language;
    const language = typeof body.language === 'string' ? body.language : (calLanguage || 'pt-BR');

    const { data: job, error: enqueueError } = await supabase.rpc('enqueue_background_job', {
      p_job_type: 'content_pipeline',
      p_payload: { contentId, calendarId, language, requestedBy: user.id },
      p_organization_id: organizationId,
      p_blog_id: (cal as unknown as { blog_id: string }).blog_id,
      p_idempotency_key: `calendar-execute:${calendarId}:${contentId}`.slice(0, 200),
      p_priority: 50,
      p_max_attempts: 3,
    } as never);
    if (enqueueError || !job) throw new Error((enqueueError as { message?: string } | null)?.message || 'Falha ao enfileirar pauta.');
    const typedJob = job as unknown as { id: string; status: string };
    logger.info('API.calendar.execute', `Calendar ${calendarId} enfileirado como job ${typedJob.id}`, { contentId });
    return NextResponse.json({ success: true, queued: true, jobId: typedJob.id, contentId, status: typedJob.status }, { status: 202 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao enfileirar pauta.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
