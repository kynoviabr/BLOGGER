import { ContentItem, ContentItemInsert, ContentItemUpdate, ContentItemWithRelations, ContentStatus, ContentSource, AIRun } from '@/types/content';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export class ContentService {
  static async listContent(filters?: { blogId?: string; status?: ContentStatus }): Promise<ContentItemWithRelations[]> {
    const supabase = await getSupabaseServerClient();
    let query = supabase
      .from('content_items')
      .select('*, blog:blogs(id, name, slug), featured_image:media_assets(*)')
      .order('created_at', { ascending: false });

    if (filters?.blogId) {
      query = query.eq('blog_id', filters.blogId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('ContentService.listContent', 'Erro ao consultar artigos no Supabase', { error, filters });
      throw new Error(`Falha ao carregar artigos: ${error.message}`);
    }

    return (data || []) as ContentItemWithRelations[];
  }

  static async getContentById(id: string): Promise<ContentItemWithRelations | null> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('content_items')
      .select('*, blog:blogs(id, name, slug), featured_image:media_assets(*), content_sources(*), ai_runs(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.error('ContentService.getContentById', `Erro ao buscar artigo ${id}`, { error });
      throw new Error(`Falha ao buscar artigo: ${error.message}`);
    }

    if (!data) return null;

    const row = data as ContentItem & {
      content_sources?: ContentSource[];
      ai_runs?: AIRun[];
    };

    return {
      ...row,
      sources: row.content_sources || [],
      ai_runs: row.ai_runs || [],
    } as ContentItemWithRelations;
  }

  static async createContent(input: ContentItemInsert): Promise<ContentItem> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('content_items')
      .insert(input)
      .select()
      .single();

    if (error) {
      logger.error('ContentService.createContent', 'Erro ao inserir artigo no Supabase', { error, input });
      throw new Error(`Não foi possível salvar o artigo: ${error.message}`);
    }

    logger.info('ContentService', `Artigo criado com sucesso: ${data.title}`);
    return data;
  }

  static async updateContent(id: string, updates: ContentItemUpdate): Promise<ContentItem> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('content_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('ContentService.updateContent', `Erro ao atualizar artigo ${id}`, { error, updates });
      throw new Error(`Não foi possível atualizar o artigo: ${error.message}`);
    }

    logger.info('ContentService', `Artigo ${id} atualizado com sucesso`);
    return data;
  }
}
