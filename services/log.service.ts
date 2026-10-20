import { Database, LogLevel, Json } from '@/types/database';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getActiveOrganizationId } from '@/lib/supabase/auth';

export type SystemLog = Database['public']['Tables']['system_logs']['Row'];

export class LogService {
  static async listLogs(filters?: { level?: LogLevel; service?: string }): Promise<SystemLog[]> {
    // Never fall back to service_role for reads: RLS must remain the tenant
    // boundary even when this service is rendered on the server.
    const supabase = await getSupabaseServerClient();
    const organizationId = await getActiveOrganizationId();
    let query = supabase
      .from('system_logs')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filters?.level) {
      query = query.eq('level', filters.level);
    }
    if (filters?.service) {
      query = query.ilike('service', `%${filters.service}%`);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('LogService.listLogs', 'Erro ao consultar logs no Supabase', { error, filters });
      throw new Error(`Falha ao carregar logs do sistema: ${error.message}`);
    }

    return (data || []) as SystemLog[];
  }

  static async recordLog(
    level: LogLevel,
    service: string,
    message: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      const supabase = await getSupabaseServerClient();
      const { error } = await supabase
        .from('system_logs')
        .insert({
          level,
          service,
          message,
          metadata: metadata as Json,
        });

      if (error) {
        logger.error('LogService.recordLog', 'Falha ao persistir system_log no Supabase', { error, service, message });
      }
    } catch (err) {
      logger.error('LogService.recordLog', 'Exceção ao persistir log', { err });
    }
  }
}
