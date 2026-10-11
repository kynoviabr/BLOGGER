import { Database, BlogStatus } from './database';

export type Blog = Database['public']['Tables']['blogs']['Row'];
export type BlogInsert = Database['public']['Tables']['blogs']['Insert'];
export type BlogUpdate = Database['public']['Tables']['blogs']['Update'];

export type BlogLanguage = Database['public']['Tables']['blog_languages']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];

export interface ThemeConfig {
  primary_color?: string;
  font_family?: string;
  dark_mode?: boolean;
  logo_url?: string;
}

export interface AutopilotConfig {
  autopilot_enabled?: boolean;
  autopilot_start_time?: string;
  autopilot_interval_minutes?: number;
  autopilot_daily_limit?: number;
}

export interface WordPressConfig {
  wp_site_url?: string;
  wp_username?: string;
  wp_application_password?: string;
}

export interface EditorialConfig {
  tone?: string;
  min_words?: number;
  max_words?: number;
  target_reading_level?: string;
  include_code_examples?: boolean;
  autopilot?: AutopilotConfig;
  wordpress?: WordPressConfig;
}

export interface SeoConfig {
  author_name?: string;
  meta_suffix?: string;
  sitemap_enabled?: boolean;
  default_og_image?: string;
}

export interface MonetizationConfig {
  affiliate_links?: boolean;
  ad_slots?: string[];
  cta_placement?: string;
}

export interface BlogWithRelations extends Blog {
  languages?: BlogLanguage[];
  categories?: Category[];
}

export type { BlogStatus };
