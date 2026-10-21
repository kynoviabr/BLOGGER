import { CalendarItem, CalendarItemInsert, CalendarItemUpdate, CalendarItemWithRelations, CalendarStatus } from '@/types/calendar';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getActiveOrganizationId } from '@/lib/supabase/auth';

export class CalendarService {
  static async listCalendarItems(filters?: { blogId?: string; status?: CalendarStatus }): Promise<CalendarItemWithRelations[]> {
    const supabase = await getSupabaseServerClient();
    const organizationId = await getActiveOrganizationId();
    let query = supabase
      .from('editorial_calendar')
      .select('*, blog:blogs!inner(id, name, slug, organization_id), category:categories(id, name, slug), content_items:content_items(id, status, title, featured_image:media_assets!content_items_featured_image_id_fkey(public_url, alt_text))')
      .eq('blog.organization_id', organizationId)
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
    const organizationId = await getActiveOrganizationId();
    const { data, error } = await supabase
      .from('editorial_calendar')
      .select('*, blog:blogs!inner(id, name, slug, organization_id), category:categories(id, name, slug)')
      .eq('id', id)
      .eq('blog.organization_id', organizationId)
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
    const finalStatus = scheduledAt ? status : (status === 'PUBLISHED' ? 'PUBLISHED' : 'PLANNED');
    const result = await this.updateCalendarItem(id, {
      scheduled_at: scheduledAt,
      status: finalStatus,
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
    } else {
      await supabase
        .from('content_items')
        .update({
          status: 'draft',
          updated_at: new Date().toISOString(),
        })
        .eq('editorial_calendar_id', id)
        .eq('status', 'scheduled');
    }

    return result;
  }

  /**
   * Aprova pautas do banco de ideias: passam de IDEA para PLANNED e recebem
   * uma data por dia a partir de startDate (padrão: amanhã).
   */
  static async approveIdeas(ids: string[], startDate?: string): Promise<{ success: boolean; count: number }> {
    if (ids.length === 0) return { success: true, count: 0 };
    const supabase = await getSupabaseServerClient();

    const base = startDate ? new Date(startDate) : new Date();
    if (!startDate) base.setDate(base.getDate() + 1);
    if (Number.isNaN(base.getTime())) throw new Error('Data de início inválida.');

    let count = 0;
    for (const [index, id] of ids.entries()) {
      const scheduledAt = new Date(base);
      scheduledAt.setDate(base.getDate() + index);
      const { data, error } = await supabase
        .from('editorial_calendar')
        .update({
          status: 'PLANNED',
          scheduled_at: scheduledAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'IDEA')
        .select('id');

      if (error) {
        logger.error('CalendarService.approveIdeas', `Falha ao aprovar pauta ${id}`, { error });
        throw new Error(`Falha ao aprovar pautas: ${error.message}`);
      }
      count += data?.length ?? 0;
    }

    logger.info('CalendarService.approveIdeas', `${count} pautas aprovadas e enviadas ao calendário.`);
    return { success: true, count };
  }

  /** Descarta pautas que ainda estão no banco de ideias (nunca apaga pautas aprovadas). */
  static async discardIdeas(ids: string[]): Promise<{ success: boolean; count: number }> {
    if (ids.length === 0) return { success: true, count: 0 };
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('editorial_calendar')
      .delete()
      .in('id', ids)
      .eq('status', 'IDEA')
      .select('id');

    if (error) {
      logger.error('CalendarService.discardIdeas', 'Falha ao descartar pautas', { error, ids });
      throw new Error(`Falha ao descartar pautas: ${error.message}`);
    }

    return { success: true, count: data?.length ?? 0 };
  }

  static async bulkRevokeSchedules(ids: string[]): Promise<{ success: boolean; count: number }> {
    if (ids.length === 0) return { success: true, count: 0 };
    const supabase = await getSupabaseServerClient();

    // 1. Pautas que NÃO estão publicadas -> voltam para PLANNED
    const { error: err1 } = await supabase
      .from('editorial_calendar')
      .update({
        scheduled_at: null,
        status: 'PLANNED',
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .neq('status', 'PUBLISHED');

    if (err1) {
      logger.error('CalendarService.bulkRevokeSchedules', 'Erro ao revogar agendamentos em lote (não-publicadas)', { error: err1, ids });
      throw new Error(`Falha ao revogar agendamentos: ${err1.message}`);
    }

    // 2. Pautas que JÁ ESTÃO publicadas -> apenas remove scheduled_at sem alterar status
    const { error: err2 } = await supabase
      .from('editorial_calendar')
      .update({
        scheduled_at: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .eq('status', 'PUBLISHED');

    if (err2) {
      logger.error('CalendarService.bulkRevokeSchedules', 'Erro ao remover scheduled_at de pautas publicadas', { error: err2, ids });
      throw new Error(`Falha ao remover agendamento de pautas publicadas: ${err2.message}`);
    }

    await supabase
      .from('content_items')
      .update({
        status: 'draft',
        updated_at: new Date().toISOString(),
      })
      .in('editorial_calendar_id', ids)
      .eq('status', 'scheduled');

    logger.info('CalendarService', `${ids.length} agendamentos revogados/limpos com sucesso`);
    return { success: true, count: ids.length };
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

