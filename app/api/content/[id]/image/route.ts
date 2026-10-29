import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { syncImageKeyFromEnv } from '@/lib/image-key-sync';
import { generateFeaturedImage, ImageRouteError } from '@/lib/featured-image';

// O botão gera a imagem aqui mesmo, sem fila: a Vercel já tem a chave da Together.
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await requireAuth();
    const supabase = await getSupabaseServerClient();

    // O artigo precisa existir e pertencer à organização de quem clicou (RLS).
    const { data: contentItem, error: contentError } = await supabase
      .from('content_items')
      .select('id, blog:blogs(organization_id)')
      .eq('id', id)
      .maybeSingle();
    if (contentError || !contentItem) {
      return NextResponse.json({ success: false, error: 'Artigo não encontrado.' }, { status: 404 });
    }
    const organizationId = (contentItem.blog as { organization_id?: string } | null)?.organization_id;
    await syncImageKeyFromEnv(supabase, organizationId);

    let promptOverride: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.prompt === 'string' && body.prompt.trim().length > 10) promptOverride = body.prompt.trim();
    } catch {}

    const result = await generateFeaturedImage(id, promptOverride);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar a imagem.';
    logger.error('API.image', msg, { error, contentId: id });
    return NextResponse.json({ success: false, error: msg }, { status: error instanceof ImageRouteError ? error.status : 500 });
  }
}
