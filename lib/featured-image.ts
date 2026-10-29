import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { buildFeaturedImagePrompt } from '@/lib/image-prompt';

// Geração da imagem de destaque, usada pelo botão do artigo e pelo worker do Supabase
// (via /api/internal/featured-image). Só a Vercel tem a chave da Together nas variáveis.

export class ImageRouteError extends Error {
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

export interface FeaturedImageResult {
  mediaAssetId: string;
  publicUrl: string;
}

export async function generateFeaturedImage(contentId: string, promptOverride?: string, scene?: string): Promise<FeaturedImageResult> {
  const startedAt = Date.now();
  const admin = getSupabaseAdminClient();
  const { data: item, error: itemError } = await admin
    .from('content_items')
    .select('id, title, excerpt, focus_keyword, blog_id, status, blog:blogs(organization_id)')
    .eq('id', contentId)
    .maybeSingle();
  if (itemError || !item) throw new ImageRouteError('Artigo não encontrado.', 404);
  const row = item as unknown as { title: string | null; excerpt: string | null; focus_keyword: string | null; blog_id: string; status: string; blog: { organization_id?: string } | null };
  const title = String(row.title ?? '');
  const prompt = promptOverride || buildFeaturedImagePrompt({ title, excerpt: row.excerpt, focusKeyword: row.focus_keyword, scene });

  // 1. Chave: a salva em Settings; se não houver, a das variáveis da Vercel.
  const { apiKey, model, source } = await resolveTogetherConfig(row.blog?.organization_id);
  // 2. Together gera a imagem.
  const buffer = await callTogether(apiKey, model, prompt);

  // 3. Salva no Storage e registra como imagem de destaque do artigo.
  const mime = detectMime(buffer);
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const filePath = `${row.blog_id}/${contentId}/featured-${Date.now()}.${ext}`;
  const { error: uploadError } = await admin.storage.from('blog-assets').upload(filePath, buffer, { contentType: mime, upsert: false });
  if (uploadError) throw new ImageRouteError(`Falha ao salvar a imagem no Storage: ${uploadError.message}`);
  const publicUrl = admin.storage.from('blog-assets').getPublicUrl(filePath).data.publicUrl;

  const { data: mediaAsset, error: mediaError } = await admin
    .from('media_assets')
    .insert({ blog_id: row.blog_id, content_id: contentId, type: 'image', storage_path: filePath, public_url: publicUrl, alt_text: `Imagem de destaque para ${title}`.slice(0, 300), prompt, provider: 'TogetherImageProvider' } as never)
    .select('id')
    .single();
  if (mediaError || !mediaAsset) throw new ImageRouteError(`Falha ao registrar a imagem: ${mediaError?.message ?? 'desconhecido'}`);
  const mediaAssetId = (mediaAsset as { id: string }).id;

  const { error: linkError } = await admin.from('content_items').update({ featured_image_id: mediaAssetId } as never).eq('id', contentId);
  if (linkError) throw new ImageRouteError(`Imagem gerada, mas não foi vinculada ao artigo: ${linkError.message}`);
  // Artigo em produção (texto pronto, esperando a imagem) passa para Revisão já com a imagem.
  await admin.from('content_items').update({ status: 'reviewing' } as never).eq('id', contentId).eq('status', 'researching').neq('body', '');

  const durationMs = Date.now() - startedAt;
  await admin.from('ai_runs').insert({ content_id: contentId, agent: 'ImageRoute', provider: 'TogetherImageProvider', model, status: 'completed', input_summary: prompt.slice(0, 200), output_summary: `Imagem ${publicUrl.slice(0, 80)}`, duration_ms: durationMs, estimated_cost: 0 } as never);
  logger.info('FeaturedImage', `Imagem gerada para ${contentId} em ${durationMs}ms (chave: ${source})`);
  return { mediaAssetId, publicUrl };
}
