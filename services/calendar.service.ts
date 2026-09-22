import { CalendarItem, CalendarItemInsert, CalendarItemUpdate, CalendarItemWithRelations, CalendarStatus } from '@/types/calendar';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export class CalendarService {
  static async listCalendarItems(filters?: { blogId?: string; status?: CalendarStatus }): Promise<CalendarItemWithRelations[]> {
    const supabase = await getSupabaseServerClient();
    let query = supabase
      .from('editorial_calendar')
      .select('*, blog:blogs(id, name, slug), category:categories(id, name, slug)')
      .order('scheduled_at', { ascending: true, nullsFirst: false });

    if (filters?.blogId) {
      query = query.eq('blog_id', filters.blogId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('CalendarService.listCalendarItems', 'Erro ao consultar pautas no Supabase', { error, filters });
      throw new Error(`Falha ao carregar calendário editorial: ${error.message}`);
    }

    return (data || []) as CalendarItemWithRelations[];
  }

  static async getCalendarItemById(id: string): Promise<CalendarItemWithRelations | null> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('editorial_calendar')
      .select('*, blog:blogs(id, name, slug), category:categories(id, name, slug)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.error('CalendarService.getCalendarItemById', `Erro ao buscar pauta ${id}`, { error });
      throw new Error(`Falha ao buscar pauta: ${error.message}`);
    }

    return data as CalendarItemWithRelations | null;
  }

  static async createCalendarItem(input: CalendarItemInsert): Promise<CalendarItem> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('editorial_calendar')
      .insert(input)
      .select()
      .single();

    if (error) {
      logger.error('CalendarService.createCalendarItem', 'Erro ao inserir pauta no Supabase', { error, input });
      throw new Error(`Não foi possível salvar a pauta: ${error.message}`);
    }

    logger.info('CalendarService', `Pauta criada com sucesso: ${data.proposed_title}`);
    return data;
  }

  static async updateCalendarItem(id: string, updates: CalendarItemUpdate): Promise<CalendarItem> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('editorial_calendar')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('CalendarService.updateCalendarItem', `Erro ao atualizar pauta ${id}`, { error, updates });
      throw new Error(`Não foi possível atualizar a pauta: ${error.message}`);
    }

    logger.info('CalendarService', `Pauta ${id} atualizada com sucesso`);
    return data;
  }

  static async updateStatus(id: string, status: CalendarStatus): Promise<CalendarItem> {
    return this.updateCalendarItem(id, { status });
  }
}
