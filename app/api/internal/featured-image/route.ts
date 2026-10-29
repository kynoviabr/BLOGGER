import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { generateFeaturedImage, ImageRouteError } from '@/lib/featured-image';

// Chamado pelo worker do Supabase depois que o texto fica pronto. A chave da
// Together só existe na Vercel, então a imagem automática também é gerada aqui.
export const maxDuration = 60;

// O worker se identifica com a própria chave service_role do projeto; ela só é aceita
// se o Supabase confirmar que é uma chave de administrador válida.
async function isWorkerKey(key: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url || !key) return false;
  if (key === process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const probe = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const key = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!(await isWorkerKey(key))) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
  }
  let contentId = '';
  try {
    const body = (await request.json()) as { contentId?: string; prompt?: string };
    contentId = String(body.contentId ?? '');
    if (!contentId) return NextResponse.json({ success: false, error: 'contentId obrigatório.' }, { status: 400 });
    const prompt = typeof body.prompt === 'string' && body.prompt.trim().length > 10 ? body.prompt.trim() : undefined;
    const result = await generateFeaturedImage(contentId, prompt);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar a imagem.';
    logger.error('API.internal.featured-image', msg, { error, contentId });
    return NextResponse.json({ success: false, error: msg }, { status: error instanceof ImageRouteError ? error.status : 500 });
  }
}
