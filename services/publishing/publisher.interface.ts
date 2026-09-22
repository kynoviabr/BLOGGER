import { PublishOptions, PublishResult, ScheduleResult } from '@/types/publishing';

export interface Publisher {
  readonly name: string;

  publish(contentId: string, options?: PublishOptions): Promise<PublishResult>;
  update(contentId: string, options?: PublishOptions): Promise<PublishResult>;
  delete(contentId: string): Promise<boolean>;
  schedule(contentId: string, publishAt: Date): Promise<ScheduleResult>;
}
