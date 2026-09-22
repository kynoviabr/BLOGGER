import { ImageGenerationPayload, JobExecutionResult } from '@/types/jobs';
import { logger } from '@/lib/logger';
import { getAIProvider } from '@/services/ai';

/**
 * ImageWorker
 * Responsável por gerar imagem destacada e assets visuais com base no conteúdo e prompt.
 * (Nesta Fase 01: Esqueleto estruturado pronto para a pipeline de mídia real).
 */
export async function executeImageWorker(payload: ImageGenerationPayload): Promise<JobExecutionResult> {
  const startTime = Date.now();
  logger.info('ImageWorker', `Iniciando worker de imagem para conteúdo: ${payload.contentId}`, { payload });

  try {
    const ai = getAIProvider();

    const imageResult = await ai.generateImage(payload.prompt, {
      aspectRatio: payload.aspectRatio || '16:9',
    });

    const durationMs = Date.now() - startTime;
    logger.info('ImageWorker', `Imagem gerada com sucesso em ${durationMs}ms`, {
      contentId: payload.contentId,
      storagePath: imageResult.storagePath,
    });

    return {
      jobId: payload.jobId,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      result: imageResult,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown image generation error';
    logger.error('ImageWorker', `Falha na geração de imagem: ${errorMessage}`, { error });

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
