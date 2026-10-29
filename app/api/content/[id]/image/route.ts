import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { syncImageKeyFromEnv } from '@/lib/image-key-sync';

// O botão gera a imagem aqui mesmo, sem fila: a Vercel já tem a chave da Together.
export const maxDuration = 60;

const VISUAL_STYLES = [
  'Conceptual minimalist still life photography, real physical objects in elegant studio composition (golden keys, precision scales, metallic gears, growing green plants on solid marble)',
  'Editorial isometric 3D render, minimalist Blender/C4D aesthetic, smooth matte textures, soft studio lighting, abstract geometric shapes representing balance and progress',
  'Modern architectural and urban photography, grand perspective, majestic concrete and glass facades, illuminated bridges, dynamic urban geometry conveying scale and future',
  'Artistic macro photography, extreme close-up of rich textures, brushed metal, intricate watchmaking mechanics, watermark paper fibers, dramatic chiaroscuro lighting',
  'Editorial conceptual flat illustration and collage, The New Yorker and The Economist cover style, bold contrasting colors, modern graphic design',
];

class ImageRouteError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

async function resolveTogetherConfig(organizationId?: string): Promise<{ apiKey: string; model: string; source: string }> {
  const fallbackModel = process.env.TOGETHER_IMAGE_MODEL || 'black-forest-labs/FLUX.1.1-pro';
  if (organizationId) {
    try {
      const admin = getSupabaseAdminClient();
      const { data } = await admin.rpc('get_provider_runtime_config' as never, { p_organization_id: organizationId, p_provider: 'together' } as never);
      const config = data as { apiKey?: string; model?: string } | null;
      if (config?.apiKey) return { apiKey: config.apiKey, model: config.model || fallbackModel, source: 'settings' };
    } catch (err) {
      logger.warn('API.image', 'Não foi possível ler a chave da Together salva em Settings', { err });
    }
  }
  if (process.env.TOGETHER_API_KEY) return { apiKey: process.env.TOGETHER_API_KEY, model: fallbackModel, source: 'vercel' };
  throw new ImageRouteError('Nenhuma chave da Together encontrada. Salve a chave em Settings > Together AI.', 400);
}

async function callTogether(apiKey: string, model: string, prompt: string): Promise<Buffer> {
  const isPro = model.includes('pro');
  const response = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, width: 1216, height: 672, n: 1, response_format: isPro ? undefined : 'b64_json', steps: isPro ? undefined : 28 }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } };
  if (!response.ok) {
    const reason = body.error?.message || response.statusText;
    if (response.status === 401 || response.status === 403) throw new ImageRouteError(`A Together recusou a chave (${response.status}): ${reason}`, 400);
    if (response.status === 402) throw new ImageRouteError(`A Together recusou por falta de saldo: ${reason}`, 400);
    throw new ImageRouteError(`Erro da Together (${response.status}): ${reason}`, 502);
  }
  const item = body.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const download = await fetch(item.url, { signal: AbortSignal.timeout(15_000) });
    if (!download.ok) throw new ImageRouteError(`Não foi possível baixar a imagem da Together (${download.status}).`, 502);
    return Buffer.from(await download.arrayBuffer());
  }
  throw new ImageRouteError('A Together não devolveu nenhuma imagem.', 502);
}

function detectMime(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return 'image/jpeg';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const startedAt = Date.now();
  try {
    await requireAuth();
    const supabase = await getSupabaseServerClient();

    // 1. O artigo precisa existir e pertencer à organização de quem clicou (RLS).
    const { data: contentItem, error: contentError } = await supabase
      .from('content_items')
      .select('id, title, blog_id, blog:blogs(organization_id)')
      .eq('id', id)
      .maybeSingle();
    if (contentError || !contentItem) {
      return NextResponse.json({ success: false, error: 'Artigo não encontrado.' }, { status: 404 });
    }
    const organizationId = (contentItem.blog as { organization_id?: string } | null)?.organization_id;
    // Mantém o cofre abastecido para a imagem automática que o worker gera depois do texto.
    await syncImageKeyFromEnv(supabase, organizationId);

    let promptOverride: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.prompt === 'string' && body.prompt.trim().length > 10) promptOverride = body.prompt.trim();
    } catch {}
    const title = String(contentItem.title ?? '');
    const style = VISUAL_STYLES[Math.floor(Math.random() * VISUAL_STYLES.length)];
    const prompt = promptOverride || `${style}. Visual metaphor for editorial theme: "${title}". Editorial studio lighting, shallow depth of field, 8k, hyper-detailed, clean elegant composition, no text, no logos, no watermarks, no screens, no laptops, no smartphones, no office desks`;

    // 2. Chave: a salva em Settings; se não houver, a das variáveis da Vercel.
    const { apiKey, model, source } = await resolveTogetherConfig(organizationId);

    // 3. Together gera a imagem.
    const buffer = await callTogether(apiKey, model, prompt);

    // 4. Salva no Storage e registra como imagem de destaque do artigo.
    const admin = getSupabaseAdminClient();
    const mime = detectMime(buffer);
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const filePath = `${contentItem.blog_id}/${id}/featured-${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage.from('blog-assets').upload(filePath, buffer, { contentType: mime, upsert: false });
    if (uploadError) throw new ImageRouteError(`Falha ao salvar a imagem no Storage: ${uploadError.message}`);
    const publicUrl = admin.storage.from('blog-assets').getPublicUrl(filePath).data.publicUrl;

    const { data: mediaAsset, error: mediaError } = await admin
      .from('media_assets')
      .insert({ blog_id: contentItem.blog_id, content_id: id, type: 'image', storage_path: filePath, public_url: publicUrl, alt_text: `Imagem de destaque para ${title}`.slice(0, 300), prompt, provider: 'TogetherImageProvider' } as never)
      .select('id')
      .single();
    if (mediaError || !mediaAsset) throw new ImageRouteError(`Falha ao registrar a imagem: ${mediaError?.message ?? 'desconhecido'}`);
    const mediaAssetId = (mediaAsset as { id: string }).id;

    const { error: linkError } = await admin.from('content_items').update({ featured_image_id: mediaAssetId } as never).eq('id', id);
    if (linkError) throw new ImageRouteError(`Imagem gerada, mas não foi vinculada ao artigo: ${linkError.message}`);

    const durationMs = Date.now() - startedAt;
    await admin.from('ai_runs').insert({ content_id: id, agent: 'ImageRoute', provider: 'TogetherImageProvider', model, status: 'completed', input_summary: prompt.slice(0, 200), output_summary: `Imagem ${publicUrl.slice(0, 80)}`, duration_ms: durationMs, estimated_cost: 0 } as never);
    logger.info('API.image', `Imagem gerada para ${id} em ${durationMs}ms (chave: ${source})`);

    // 5. Volta para a tela com a URL nova.
    return NextResponse.json({ success: true, mediaAssetId, publicUrl });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar a imagem.';
    logger.error('API.image', msg, { error, contentId: id });
    return NextResponse.json({ success: false, error: msg }, { status: error instanceof ImageRouteError ? error.status : 500 });
  }
}
