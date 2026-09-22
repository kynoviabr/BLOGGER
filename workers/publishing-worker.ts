import { PublishingPayload, JobExecutionResult } from '@/types/jobs';
import { logger } from '@/lib/logger';
import { getPublisher } from '@/services/publishing';

/**
 * PublishingWorker
 * Responsável por publicar o artigo aprovado na plataforma de destino (CMS, API, Webhook).
 * (Nesta Fase 01: Esqueleto estruturado pronto para a integração de publicação real).
 */
export async function executePublishingWorker(payload: PublishingPayload): Promise<JobExecutionResult> {
  const startTime = Date.now();
  logger.info('PublishingWorker', `Iniciando worker de publicação para conteúdo: ${payload.contentId}`, { payload });

  try {
    const publisher = getPublisher();

    const publishResult = await publisher.publish(payload.contentId, {
      notifySubscribers: true,
    });

    const durationMs = Date.now() - startTime;
    logger.info('PublishingWorker', `Conteúdo publicado com sucesso em ${durationMs}ms`, {
      contentId: payload.contentId,
      publishedUrl: publishResult.publishedUrl,
    });

    return {
      jobId: payload.jobId,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      result: publishResult,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown publishing error';
    logger.error('PublishingWorker', `Falha na publicação: ${errorMessage}`, { error });

    return {
      jobId: payload.jobId,
      status: 'failed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      error: errorMessage,
    };
  }
}
