import { Blog, BlogInsert, BlogUpdate, BlogWithRelations, Category } from '@/types/blog';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export class BlogService {
  static async listBlogs(): Promise<BlogWithRelations[]> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('blogs')
      .select('*, blog_languages(*), categories(*)')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('BlogService.listBlogs', 'Erro ao consultar blogs no Supabase', { error });
      throw new Error(`Falha ao carregar blogs: ${error.message}`);
    }

    return (data || []).map((b) => {
      const rel = b as Blog & {
        blog_languages: BlogWithRelations['languages'];
        categories: Category[];
      };
      return {
        ...b,
        languages: rel.blog_languages || [],
        categories: rel.categories || [],
      };
    });
  }

  static async getBlogById(id: string): Promise<BlogWithRelations | null> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('blogs')
      .select('*, blog_languages(*), categories(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.error('BlogService.getBlogById', `Erro ao buscar blog ${id}`, { error });
      throw new Error(`Falha ao buscar blog: ${error.message}`);
    }

    if (!data) return null;

    const rel = data as Blog & {
      blog_languages: BlogWithRelations['languages'];
      categories: Category[];
    };

    return {
      ...data,
      languages: rel.blog_languages || [],
      categories: rel.categories || [],
    };
  }

  static async createBlog(input: BlogInsert): Promise<Blog> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('blogs')
      .insert(input)
      .select()
      .single();

    if (error) {
      logger.error('BlogService.createBlog', 'Erro ao inserir blog no Supabase', { error, input });
      throw new Error(`Não foi possível salvar o blog: ${error.message}`);
    }

    logger.info('BlogService', `Blog criado com sucesso no Supabase: ${data.name}`);
    return data;
  }

  static async updateBlog(id: string, updates: BlogUpdate): Promise<Blog> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('blogs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('BlogService.updateBlog', `Erro ao atualizar blog ${id}`, { error, updates });
      throw new Error(`Não foi possível atualizar o blog: ${error.message}`);
    }

    logger.info('BlogService', `Blog ${id} atualizado com sucesso`);
    return data;
  }

  static async toggleBlogStatus(id: string): Promise<Blog> {
    const blog = await this.getBlogById(id);
    if (!blog) {
      throw new Error(`Blog não encontrado para o ID: ${id}`);
    }
    const nextStatus = blog.status === 'active' ? 'inactive' : 'active';
    return this.updateBlog(id, { status: nextStatus });
  }
}
