import { MediaAsset, MediaAssetInsert } from '@/types/media';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getActiveOrganizationId } from '@/lib/supabase/auth';

export class MediaService {
  static async listMedia(blogId?: string): Promise<MediaAsset[]> {
    const supabase = await getSupabaseServerClient();
    const organizationId = await getActiveOrganizationId();
    let query = supabase
      .from('media_assets')
      .select('*, blog:blogs!inner(organization_id)')
      .eq('blog.organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (blogId) {
      query = query.eq('blog_id', blogId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('MediaService.listMedia', 'Erro ao listar mídias no Supabase', { error, blogId });
      throw new Error(`Falha ao carregar assets de mídia: ${error.message}`);
    }

    return (data || []) as MediaAsset[];
  }

  static async deleteMedia(id: string): Promise<void> {
    const supabase = await getSupabaseServerClient();

    const { data: asset, error: lookupError } = await supabase
      .from('media_assets')
      .select('id')
      .eq('id', id)
      .single();

    if (lookupError || !asset) {
      logger.error('MediaService.deleteMedia', 'Asset não encontrado para exclusão', { id, error: lookupError });
      throw new Error('Asset de mídia não encontrado.');
    }

    const { error } = await supabase
      .from('media_assets')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('MediaService.deleteMedia', 'Erro ao excluir asset de mídia', { id, error });
      throw new Error(`Não foi possível excluir o asset de mídia: ${error.message}`);
    }

    logger.info('MediaService', `Asset de mídia excluído: ${id}`);
  }

  static async createMedia(input: MediaAssetInsert): Promise<MediaAsset> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('media_assets')
      .insert(input)
      .select()
      .single();

    if (error) {
      logger.error('MediaService.createMedia', 'Erro ao registrar asset de mídia no Supabase', { error, input });
      throw new Error(`Não foi possível salvar asset de mídia: ${error.message}`);
    }

    logger.info('MediaService', `Asset de mídia criado com sucesso: ${data.id}`);
    return data;
  }
}
