import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: job, error } = await supabase.from('background_jobs')
    .select('id,status,result,last_error,attempts,max_attempts,updated_at').eq('id', id).maybeSingle();
  if (error || !job) return NextResponse.json({ success: false, error: 'Job não encontrado.' }, { status: 404 });
  return NextResponse.json({ success: true, job });
}
