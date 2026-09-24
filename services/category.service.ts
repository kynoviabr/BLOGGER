import { Category } from '@/types/blog';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils';
import { logger } from '@/lib/logger';

export interface CreateCategoryInput {
  blog_id: string;
  name: string;
  slug?: string;
  description?: string | null;
}

export interface UpdateCategoryInput {
  name: string;
  slug?: string;
  description?: string | null;
}

export class CategoryService {
  /**
   * Lista categorias pertencentes a um blog específico.
   */
  static async listCategoriesByBlog(blogId: string): Promise<Category[]> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('blog_id', blogId)
      .order('name', { ascending: true });

    if (error) {
      logger.error('CategoryService.listCategoriesByBlog', `Erro ao buscar categorias do blog ${blogId}`, { error });
      throw new Error(`Falha ao buscar categorias: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Cria uma nova categoria associada a um blog.
   */
  static async createCategory(input: CreateCategoryInput): Promise<Category> {
    const supabase = await getSupabaseServerClient();
    const finalSlug = input.slug && input.slug.trim().length > 0 ? slugify(input.slug) : slugify(input.name);

    const { data, error } = await supabase
      .from('categories')
      .insert({
        blog_id: input.blog_id,
        name: input.name.trim(),
        slug: finalSlug,
        description: input.description?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      logger.error('CategoryService.createCategory', 'Erro ao criar categoria no Supabase', { error, input });
      if (error.code === '23505') {
        throw new Error(`Já existe uma categoria com este slug ou nome neste blog.`);
      }
      throw new Error(`Não foi possível salvar a categoria: ${error.message}`);
    }

    logger.info('CategoryService', `Categoria criada com sucesso: ${data.name} (Blog: ${data.blog_id})`);
    return data;
  }

  /**
   * Atualiza uma categoria existente.
   */
  static async updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
    const supabase = await getSupabaseServerClient();
    const finalSlug = input.slug && input.slug.trim().length > 0 ? slugify(input.slug) : slugify(input.name);

    const { data, error } = await supabase
      .from('categories')
      .update({
        name: input.name.trim(),
        slug: finalSlug,
        description: input.description !== undefined ? (input.description?.trim() || null) : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('CategoryService.updateCategory', `Erro ao atualizar categoria ${id}`, { error, input });
      if (error.code === '23505') {
        throw new Error(`Já existe outra categoria com este slug ou nome neste blog.`);
      }
      throw new Error(`Não foi possível atualizar a categoria: ${error.message}`);
    }

    logger.info('CategoryService', `Categoria ${id} atualizada com sucesso: ${data.name}`);
    return data;
  }

  /**
   * Remove uma categoria pelo ID com proteção contra exclusão de categorias em uso.
   */
  static async deleteCategory(id: string): Promise<void> {
    const supabase = await getSupabaseServerClient();

    // 1. Verificar se a categoria está sendo usada no Calendário Editorial
    const { count: calendarCount, error: calendarCheckError } = await supabase
      .from('editorial_calendar')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id);

    if (calendarCheckError) {
      logger.error('CategoryService.deleteCategory', `Erro ao verificar dependências da categoria ${id}`, { error: calendarCheckError });
    }

    if (calendarCount && calendarCount > 0) {
      throw new Error('Esta categoria está sendo utilizada por conteúdos existentes no calendário.');
    }

    // 2. Executar exclusão
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('CategoryService.deleteCategory', `Erro ao deletar categoria ${id}`, { error });
      throw new Error(`Não foi possível remover a categoria: ${error.message}`);
    }

    logger.info('CategoryService', `Categoria ${id} removida com sucesso`);
  }
}
