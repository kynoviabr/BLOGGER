export type JobType = 'content_generation' | 'image_generation' | 'article_publishing';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface BaseJobPayload {
  jobId: string;
  blogId: string;
  createdAt: string;
}

export interface ContentGenerationPayload extends BaseJobPayload {
  type: 'content_generation';
  calendarItemId: string;
  topic: string;
  language: string;
  keywords: string[];
}

export interface ImageGenerationPayload extends BaseJobPayload {
  type: 'image_generation';
  contentId: string;
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '4:3';
}

export interface PublishingPayload extends BaseJobPayload {
  type: 'article_publishing';
  contentId: string;
  targetPlatform?: string;
}

export type JobPayload =
  | ContentGenerationPayload
  | ImageGenerationPayload
  | PublishingPayload;

export interface JobExecutionResult {
  jobId: string;
  status: JobStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  result?: unknown;
  error?: string;
}
