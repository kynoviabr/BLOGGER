import { Database, CalendarStatus, CalendarPriority } from './database';
import { Blog } from './blog';

export type CalendarItem = Database['public']['Tables']['editorial_calendar']['Row'];
export type CalendarItemInsert = Database['public']['Tables']['editorial_calendar']['Insert'];
export type CalendarItemUpdate = Database['public']['Tables']['editorial_calendar']['Update'];

export interface CalendarItemWithRelations extends CalendarItem {
  blog?: Pick<Blog, 'id' | 'name' | 'slug'>;
  category?: { id: string; name: string; slug: string } | null;
  last_error?: string | null;
  content_item?: {
    id: string;
    status: string;
    title?: string;
    featured_image?: {
      public_url?: string;
      alt_text?: string | null;
    } | null;
  } | null;
}

export type { CalendarStatus, CalendarPriority };

