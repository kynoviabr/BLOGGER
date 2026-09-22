import { Database, ContentStatus } from './database';
import { Blog } from './blog';
import { MediaAsset } from './media';

export type ContentItem = Database['public']['Tables']['content_items']['Row'];
export type ContentItemInsert = Database['public']['Tables']['content_items']['Insert'];
export type ContentItemUpdate = Database['public']['Tables']['content_items']['Update'];

export type ContentSource = Database['public']['Tables']['content_sources']['Row'];
export type AIRun = Database['public']['Tables']['ai_runs']['Row'];

export interface ContentItemWithRelations extends ContentItem {
  blog?: Pick<Blog, 'id' | 'name' | 'slug'>;
  featured_image?: MediaAsset | null;
  sources?: ContentSource[];
  ai_runs?: AIRun[];
}

export type { ContentStatus };
