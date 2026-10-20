import { ContentItem, ContentItemInsert, ContentItemUpdate, ContentItemWithRelations, ContentStatus, ContentSource, AIRun } from '@/types/content';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getActiveOrganizationId } from '@/lib/supabase/auth';

export class ContentService {
  static async listContent(filters?: { blogId?: string; status?: ContentStatus }): Promise<ContentItemWithRelations[]> {
    const supabase = await getSupabaseServerClient();
    const organizationId = await getActiveOrganizationId();
    let query = supabase
      .from('content_items')
      .select('*, blog:blogs!inner(id, name, slug, organization_id), featured_image:media_assets!content_items_featured_image_id_fkey(*)')
      .eq('blog.organization_id', organizationId)
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
    const organizationId = await getActiveOrganizationId();
    const { data, error } = await supabase
      .from('content_items')
      .select('*, blog:blogs!inner(id, name, slug, organization_id), featured_image:media_assets!content_items_featured_image_id_fkey(*), content_sources(*), ai_runs(*)')
      .eq('id', id)
      .eq('blog.organization_id', organizationId)
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
    let { data, error } = await supabase
      .from('content_items')
      .insert(input)
      .select()
      .single();

    if (
      error &&
      (error.message.includes('focus_keyword') ||
        error.message.includes('tags') ||
        error.message.includes('schema cache'))
    ) {
      logger.warn(
        'ContentService.createContent',
        `Colunas de SEO ainda não migradas no Supabase (${error.message}). Inserindo sem focus_keyword e tags.`
      );
      const safeInput = { ...input };
      delete (safeInput as Record<string, unknown>).focus_keyword;
      delete (safeInput as Record<string, unknown>).tags;

      const fallbackRes = await supabase
        .from('content_items')
        .insert(safeInput)
        .select()
        .single();

      data = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error || !data) {
      logger.error('ContentService.createContent', 'Erro ao inserir artigo no Supabase', { error, input });
      throw new Error(`Não foi possível salvar o artigo: ${error?.message || 'Erro desconhecido ao salvar artigo'}`);
    }

    logger.info('ContentService', `Artigo criado com sucesso: ${data.title}`);
    return data;
  }

  static async updateContent(id: string, updates: ContentItemUpdate): Promise<ContentItem> {
    const supabase = await getSupabaseServerClient();
    let { data, error } = await supabase
      .from('content_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (
      error &&
      (error.message.includes('focus_keyword') ||
        error.message.includes('tags') ||
        error.message.includes('schema cache'))
    ) {
      logger.warn(
        'ContentService.updateContent',
        `Colunas de SEO ainda não migradas no Supabase (${error.message}). Repetindo atualização sem focus_keyword e tags.`
      );
      const safeUpdates = { ...updates };
      delete (safeUpdates as Record<string, unknown>).focus_keyword;
      delete (safeUpdates as Record<string, unknown>).tags;

      const fallbackRes = await supabase
        .from('content_items')
        .update(safeUpdates)
        .eq('id', id)
        .select()
        .single();

      data = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error || !data) {
      logger.error('ContentService.updateContent', `Erro ao atualizar artigo ${id}`, { error, updates });
      throw new Error(`Não foi possível atualizar o artigo: ${error?.message || 'Erro desconhecido ao atualizar artigo'}`);
    }

    logger.info('ContentService', `Artigo ${id} atualizado com sucesso`);
    return data;
  }
}
