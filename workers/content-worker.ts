import { ContentGenerationPayload, JobExecutionResult } from '@/types/jobs';
import { logger } from '@/lib/logger';
import { getAIProvider } from '@/services/ai';

/**
 * ContentWorker
 * Responsável por orquestrar a pesquisa e redação do artigo a partir de um item de calendário.
 * (Nesta Fase 01: Esqueleto estruturado pronto para a pipeline de IA real).
 */
export async function executeContentWorker(payload: ContentGenerationPayload): Promise<JobExecutionResult> {
  const startTime = Date.now();
  logger.info('ContentWorker', `Iniciando worker de conteúdo para pauta: "${payload.topic}"`, { payload });

  try {
    const ai = getAIProvider();

    // Simulação do ciclo da Foundation:
    const draft = await ai.generateText(
      `Escreva um artigo completo sobre "${payload.topic}". Palavras-chave: ${payload.keywords.join(', ')}`,
      { tone: 'editorial profissional' }
    );

    const durationMs = Date.now() - startTime;
    logger.info('ContentWorker', `Artigo pré-gerado com sucesso em ${durationMs}ms`, {
      calendarItemId: payload.calendarItemId,
      provider: draft.provider,
    });

    return {
      jobId: payload.jobId,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      result: {
        title: payload.topic,
        bodyPreview: draft.text.slice(0, 100),
        tokens: draft.usage?.totalTokens,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown content generation error';
    logger.error('ContentWorker', `Falha na geração de conteúdo: ${errorMessage}`, { error });

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
