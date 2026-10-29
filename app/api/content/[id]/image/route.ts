import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { syncImageKeyFromEnv } from '@/lib/image-key-sync';
import { generateFeaturedImage, ImageRouteError, type ReferenceImage } from '@/lib/featured-image';

// O botão gera a imagem aqui mesmo, sem fila: a Vercel já tem a chave da Together.
export const maxDuration = 90;

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
    let scene: string | undefined;
    let reference: ReferenceImage | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.prompt === 'string' && body.prompt.trim().length > 10) promptOverride = body.prompt.trim();
      // Frase da pessoa ("uma pessoa na bolsa de valores"): vira a cena; o estilo continua variado.
      if (body && typeof body.scene === 'string' && body.scene.trim().length >= 3) scene = body.scene.trim().slice(0, 400);
      // Imagem de referência enviada pela pessoa, como data URL (o navegador já reduz o tamanho).
      if (body && typeof body.referenceImage === 'string') {
        const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.referenceImage);
        if (!match) throw new ImageRouteError('Imagem de referência inválida. Use JPG, PNG ou WebP.', 400);
        const buffer = Buffer.from(match[2], 'base64');
        if (buffer.length > 3_000_000) throw new ImageRouteError('A imagem de referência é grande demais (máximo 3 MB).', 400);
        reference = { buffer, mime: match[1] };
      }
    } catch (err) {
      if (err instanceof ImageRouteError) throw err;
    }

    const result = await generateFeaturedImage(id, promptOverride, scene, reference);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar a imagem.';
    logger.error('API.image', msg, { error, contentId: id });
    return NextResponse.json({ success: false, error: msg }, { status: error instanceof ImageRouteError ? error.status : 500 });
  }
}
