import { Publisher } from './publisher.interface';
import { PublishOptions, PublishResult, ScheduleResult } from '@/types/publishing';
import { logger } from '@/lib/logger';

export class MockPublisher implements Publisher {
  readonly name = 'MockPublisher';

  async publish(contentId: string, options?: PublishOptions): Promise<PublishResult> {
    logger.info('MockPublisher', `Publishing content item: ${contentId}`, { options });

    return {
      success: true,
      publishedUrl: `https://mock-blog.local/posts/${options?.customSlug || contentId}`,
      externalPostId: `mock-post-${Date.now()}`,
      publishedAt: new Date().toISOString(),
      provider: this.name,
    };
  }

  async update(contentId: string, options?: PublishOptions): Promise<PublishResult> {
    logger.info('MockPublisher', `Updating content item: ${contentId}`, { options });

    return {
      success: true,
      publishedUrl: `https://mock-blog.local/posts/${options?.customSlug || contentId}`,
      externalPostId: `mock-post-${contentId}`,
      publishedAt: new Date().toISOString(),
      provider: this.name,
    };
  }

  async delete(contentId: string): Promise<boolean> {
    logger.info('MockPublisher', `Deleting published content: ${contentId}`);
    return true;
  }

  async schedule(contentId: string, publishAt: Date): Promise<ScheduleResult> {
    logger.info('MockPublisher', `Scheduling publication: ${contentId}`, { publishAt: publishAt.toISOString() });

    return {
      success: true,
      scheduledFor: publishAt.toISOString(),
      jobId: `sched-job-${Date.now()}`,
    };
  }
}
