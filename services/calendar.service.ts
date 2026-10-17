import { CalendarItem, CalendarItemInsert, CalendarItemUpdate, CalendarItemWithRelations, CalendarStatus } from '@/types/calendar';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export class CalendarService {
  static async listCalendarItems(filters?: { blogId?: string; status?: CalendarStatus }): Promise<CalendarItemWithRelations[]> {
    const supabase = await getSupabaseServerClient();
    let query = supabase
      .from('editorial_calendar')
      .select('*, blog:blogs(id, name, slug), category:categories(id, name, slug), content_items:content_items(id, status, title, featured_image:media_assets!content_items_featured_image_id_fkey(public_url, alt_text))')
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

    const items = ((data || []) as any[]).map((raw) => {
      const contentList = raw.content_items;
      const firstContent = Array.isArray(contentList) && contentList.length > 0 ? contentList[0] : null;
      return {
        ...raw,
        content_item: firstContent,
      } as CalendarItemWithRelations;
    });

    // Se houver itens com status FAILED, busca a mensagem do último erro registrado em system_logs
    const failedItems = items.filter((it) => it.status === 'FAILED');
    if (failedItems.length > 0) {
      try {
        const { data: logs } = await supabase
          .from('system_logs')
          .select('message, metadata, created_at')
          .eq('level', 'error')
          .order('created_at', { ascending: false })
          .limit(100);

        if (logs && logs.length > 0) {
          for (const item of failedItems) {
            const match = logs.find((l) => {
              const meta = l.metadata as { calendarId?: string; error?: string } | null;
              if (meta && meta.calendarId === item.id) return true;
              return l.message?.includes(item.id);
            });
            if (match) {
              const meta = match.metadata as { error?: string } | null;
              item.last_error = meta?.error || match.message;
            } else {
              item.last_error = 'Falha registrada durante a execução do pipeline editorial.';
            }
          }
        }
      } catch (logErr) {
        logger.warn('CalendarService.listCalendarItems', `Aviso ao consultar logs de erro: ${String(logErr)}`);
      }
    }

    return items;
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

  static async updateItemSchedule(id: string, scheduledAt: string | null, status: CalendarStatus = 'SCHEDULED'): Promise<CalendarItem> {
    const supabase = await getSupabaseServerClient();
    const result = await this.updateCalendarItem(id, {
      scheduled_at: scheduledAt,
      status: scheduledAt ? status : 'PLANNED',
    });

    // Sincroniza content_items correspondente se existir
    if (scheduledAt) {
      await supabase
        .from('content_items')
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq('editorial_calendar_id', id)
        .neq('status', 'published');
    }

    return result;
  }

  static async bulkScheduleItems(
    schedules: Array<{ id: string; scheduledAt: string; status?: CalendarStatus }>
  ): Promise<{ success: boolean; count: number }> {
    const supabase = await getSupabaseServerClient();
    let count = 0;

    for (const schedule of schedules) {
      try {
        await supabase
          .from('editorial_calendar')
          .update({
            scheduled_at: schedule.scheduledAt,
            status: schedule.status || 'SCHEDULED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', schedule.id);

        await supabase
          .from('content_items')
          .update({
            updated_at: new Date().toISOString(),
          })
          .eq('editorial_calendar_id', schedule.id)
          .neq('status', 'published');

        count++;
      } catch (err) {
        logger.error('CalendarService.bulkScheduleItems', `Falha ao agendar pauta ${schedule.id}`, { err });
      }
    }

    logger.info('CalendarService.bulkScheduleItems', `${count} pautas agendadas com sucesso no Supabase.`);
    return { success: true, count };
  }
}

