import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export async function syncImageKeyFromEnv(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>, organizationId?: string) {
  if (!organizationId) return;
  try {
    const { data, error: listError } = await supabase.rpc('list_provider_credentials' as never, { p_organization_id: organizationId } as never);
    if (listError) return;
    const stored = new Set((Array.isArray(data) ? data : []).map((row: { provider?: string }) => row.provider));
    if (stored.has('together') || stored.has('openai')) return;
    const provider = process.env.TOGETHER_API_KEY ? 'together' : process.env.OPENAI_API_KEY ? 'openai' : null;
    if (!provider) return;
    const apiKey = provider === 'together' ? process.env.TOGETHER_API_KEY : process.env.OPENAI_API_KEY;
    const { error } = await supabase.rpc('upsert_provider_credential' as never, {
      p_provider: provider,
      p_api_key: apiKey,
      p_model: null,
      p_base_url: null,
      p_enabled: true,
      p_organization_id: organizationId,
    } as never);
    if (error) logger.warn('API.image', `Não foi possível copiar a chave ${provider} para o cofre: ${error.message}`);
    else logger.info('API.image', `Chave ${provider} copiada das variáveis da Vercel para o cofre da organização`);
  } catch (err) {
    logger.warn('API.image', 'Falha ao sincronizar chave de imagem', { err });
  }
}
