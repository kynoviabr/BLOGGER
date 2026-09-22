import { MediaAsset, MediaAssetInsert } from '@/types/media';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export class MediaService {
  static async listMedia(blogId?: string): Promise<MediaAsset[]> {
    const supabase = await getSupabaseServerClient();
    let query = supabase
      .from('media_assets')
      .select('*')
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
