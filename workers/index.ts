import { JobPayload, JobExecutionResult } from '@/types/jobs';
import { executeContentWorker } from './content-worker';
import { executeImageWorker } from './image-worker';
import { executePublishingWorker } from './publishing-worker';
import { logger } from '@/lib/logger';

export async function processJob(payload: JobPayload): Promise<JobExecutionResult> {
  logger.info('WorkerRegistry', `Despachando job do tipo: ${payload.type}`, { jobId: payload.jobId });

  switch (payload.type) {
    case 'content_generation':
      return executeContentWorker(payload);
    case 'image_generation':
      return executeImageWorker(payload);
    case 'article_publishing':
      return executePublishingWorker(payload);
    default:
      throw new Error(`Tipo de job não suportado`);
  }
}

export { executeContentWorker, executeImageWorker, executePublishingWorker };
