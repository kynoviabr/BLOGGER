export interface PublishOptions {
  publishAt?: Date | string;
  customSlug?: string;
  categories?: string[];
  tags?: string[];
  notifySubscribers?: boolean;
}

export interface PublishResult {
  success: boolean;
  publishedUrl?: string;
  externalPostId?: string;
  publishedAt: string;
  provider: string;
  error?: string;
}

export interface ScheduleResult {
  success: boolean;
  scheduledFor: string;
  jobId?: string;
  error?: string;
}
