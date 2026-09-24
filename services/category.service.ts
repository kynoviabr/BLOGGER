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
   * Remove uma categoria pelo ID.
   */
  static async deleteCategory(id: string): Promise<void> {
    const supabase = await getSupabaseServerClient();
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
