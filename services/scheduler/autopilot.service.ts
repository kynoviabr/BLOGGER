import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { PipelineService, PipelineExecutionResult } from '@/services/pipeline.service';
import { logger } from '@/lib/logger';
import { Blog, AutopilotConfig } from '@/types/blog';

export interface AutopilotExecutionRecord {
  blogId: string;
  blogName: string;
  calendarId: string;
  title: string;
  result: PipelineExecutionResult;
}

export interface AutopilotRunSummary {
  checkedAt: string;
  blogsChecked: number;
  blogsExecuted: number;
  executions: AutopilotExecutionRecord[];
}

export class AutopilotService {
  /**
   * Avalia a cadência e executa a produção automática para os blogs com Autopilot ativado:
   * a) Busca blogs ativos com autopilot_enabled = true
   * b) Verifica se hora atual >= autopilot_start_time
   * c) Conta publicações de hoje vs autopilot_daily_limit
   * d) Verifica intervalo desde a última publicação vs autopilot_interval_minutes
   * e) Dispara a pauta mais antiga com status 'PLANNED' ou 'READY'
   */
  static async checkAndRun(): Promise<AutopilotRunSummary> {
    const now = new Date();
    const adminSupabase = getSupabaseAdminClient();
    const summary: AutopilotRunSummary = {
      checkedAt: now.toISOString(),
      blogsChecked: 0,
      blogsExecuted: 0,
      executions: [],
    };

    logger.info('AutopilotService', `[Autopilot] Iniciando verificação de cadência (${now.toLocaleTimeString()})`);

    try {
      // a) Buscar todos os blogs ativos
      const { data: blogs, error: blogsErr } = await adminSupabase
        .from('blogs')
        .select('*')
        .eq('status', 'active');

      if (blogsErr) {
        throw new Error(`Falha ao consultar blogs: ${blogsErr.message}`);
      }

      if (!blogs || blogs.length === 0) {
        logger.info('AutopilotService', '[Autopilot] Nenhum blog ativo encontrado no sistema.');
        return summary;
      }

      for (const blog of blogs) {
        summary.blogsChecked++;

        // Extrai configurações de autopilot da coluna direta ou de editorial_config
        const edConfig = (blog.editorial_config as { autopilot?: AutopilotConfig })?.autopilot ||
          (blog.editorial_config as AutopilotConfig) || {};

        const typedBlog = blog as unknown as Blog;
        const isEnabled = typedBlog.autopilot_enabled ?? edConfig.autopilot_enabled ?? false;

        if (!isEnabled) {
          continue;
        }

        const startTimeStr = typedBlog.autopilot_start_time ||
          edConfig.autopilot_start_time || '06:00';
        const intervalMinutes = Number(
          typedBlog.autopilot_interval_minutes ||
          edConfig.autopilot_interval_minutes || 30
        );
        const dailyLimit = Number(
          typedBlog.autopilot_daily_limit ||
          edConfig.autopilot_daily_limit || 5
        );

        logger.info('AutopilotService', `[Autopilot] Avaliando blog "${blog.name}"`, {
          startTimeStr,
          intervalMinutes,
          dailyLimit,
        });

        // b) Verifica se a hora atual é maior ou igual ao autopilot_start_time (HH:mm)
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentMinutesFromMidnight = currentHour * 60 + currentMinute;

        const [startH, startM] = startTimeStr.split(':').map((v) => parseInt(v, 10) || 0);
        const startMinutesFromMidnight = startH * 60 + startM;

        if (currentMinutesFromMidnight < startMinutesFromMidnight) {
          logger.info('AutopilotService', `[Autopilot] Blog "${blog.name}": Hora atual (${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}) anterior ao início programado (${startTimeStr}). Pulando.`);
          continue;
        }

        // c) Contar artigos publicados hoje para este blog
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
        const { count: publishedTodayCount, error: countErr } = await adminSupabase
          .from('content_items')
          .select('id', { count: 'exact', head: true })
          .eq('blog_id', blog.id)
          .eq('status', 'published')
          .gte('published_at', startOfToday);

        if (countErr) {
          logger.warn('AutopilotService', `Aviso ao contar artigos publicados hoje: ${countErr.message}`);
        }

        const currentPublished = publishedTodayCount || 0;
        if (currentPublished >= dailyLimit) {
          logger.info('AutopilotService', `[Autopilot] Blog "${blog.name}": Limite diário de publicações atingido (${currentPublished}/${dailyLimit}). Pulando.`);
          continue;
        }

        // d) Buscar o último artigo publicado hoje e checar o intervalo
        const { data: lastPublished } = await adminSupabase
          .from('content_items')
          .select('published_at')
          .eq('blog_id', blog.id)
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastPublished && lastPublished.published_at) {
          const lastTime = new Date(lastPublished.published_at).getTime();
          const elapsedMinutes = (now.getTime() - lastTime) / (1000 * 60);

          if (elapsedMinutes < intervalMinutes) {
            logger.info('AutopilotService', `[Autopilot] Blog "${blog.name}": Intervalo mínimo de ${intervalMinutes}m não atingido (última publicação há ${Math.floor(elapsedMinutes)}m). Pulando.`);
            continue;
          }
        }

        // e) Buscar a pauta mais antiga com status 'PLANNED' ou 'READY' desse blog
        const { data: candidateItems, error: candidateErr } = await adminSupabase
          .from('editorial_calendar')
          .select('id, topic, proposed_title, status, scheduled_at, created_at')
          .eq('blog_id', blog.id)
          .in('status', ['PLANNED', 'READY'])
          .order('scheduled_at', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true })
          .limit(1);

        if (candidateErr) {
          logger.error('AutopilotService', `Erro ao buscar próxima pauta para blog ${blog.id}: ${candidateErr.message}`);
          continue;
        }

        const targetPauta = candidateItems?.[0];
        if (!targetPauta) {
          logger.info('AutopilotService', `[Autopilot] Blog "${blog.name}": Nenhuma pauta 'PLANNED' ou 'READY' na fila.`);
          continue;
        }

        // Dispara o pipeline de publicação da pauta
        logger.info('AutopilotService', `[Autopilot] 🚀 Disparando pauta "${targetPauta.proposed_title || targetPauta.topic}" para o blog "${blog.name}"`);

        const execResult = await PipelineService.executeItem(targetPauta.id, {
          triggeredBy: 'autopilot',
        });

        summary.blogsExecuted++;
        summary.executions.push({
          blogId: blog.id,
          blogName: blog.name,
          calendarId: targetPauta.id,
          title: targetPauta.proposed_title || targetPauta.topic,
          result: execResult,
        });

        // Registrar em system_logs
        await adminSupabase.from('system_logs').insert({
          level: execResult.success ? 'info' : 'error',
          service: 'AutopilotService',
          message: `[Autopilot] Execução da pauta "${targetPauta.proposed_title || targetPauta.topic}" para o blog "${blog.name}": ${execResult.success ? 'Sucesso (Publicado)' : 'Falha (' + (execResult.error || 'Desconhecido') + ')'}`,
          metadata: {
            blogId: blog.id,
            calendarId: targetPauta.id,
            status: execResult.status,
            wpUrl: execResult.wpUrl,
          },
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('AutopilotService', `Erro no ciclo de verificação do Autopilot: ${msg}`, { err });
    }

    return summary;
  }
}
