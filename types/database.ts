export type Json =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];

export type BlogStatus = 'active' | 'inactive' | 'archived';
export type CalendarPriority = 'low' | 'medium' | 'high';
export type CalendarStatus =
  | 'IDEA'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'READY'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'FAILED';
export type ContentStatus =
  | 'draft'
  | 'reviewing'
  | 'ready'
  | 'scheduled'
  | 'published'
  | 'archived';
export type MediaType = 'image' | 'video' | 'infographic';
export type AIRunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export type Database = {
  public: {
    Tables: {
      blogs: {
        Row: {
          id: string;
          name: string;
          slug: string;
          domain: string;
          description: string | null;
          niche: string;
          audience: string | null;
          default_language: string;
          status: BlogStatus;
          theme_config: Json;
          editorial_config: Json;
          seo_config: Json;
          monetization_config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          domain: string;
          description?: string | null;
          niche: string;
          audience?: string | null;
          default_language?: string;
          status?: BlogStatus;
          theme_config?: Json;
          editorial_config?: Json;
          seo_config?: Json;
          monetization_config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          domain?: string;
          description?: string | null;
          niche?: string;
          audience?: string | null;
          default_language?: string;
          status?: BlogStatus;
          theme_config?: Json;
          editorial_config?: Json;
          seo_config?: Json;
          monetization_config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      blog_languages: {
        Row: {
          id: string;
          blog_id: string;
          language: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          blog_id: string;
          language: string;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          blog_id?: string;
          language?: string;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blog_languages_blog_id_fkey";
            columns: ["blog_id"];
            isOneToOne: false;
            referencedRelation: "blogs";
            referencedColumns: ["id"];
          }
        ];
      };
      categories: {
        Row: {
          id: string;
          blog_id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          blog_id: string;
          name: string;
          slug: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          blog_id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_blog_id_fkey";
            columns: ["blog_id"];
            isOneToOne: false;
            referencedRelation: "blogs";
            referencedColumns: ["id"];
          }
        ];
      };
      editorial_calendar: {
        Row: {
          id: string;
          blog_id: string;
          category_id: string | null;
          language: string;
          topic: string;
          proposed_title: string;
          keywords: string[];
          article_type: string;
          scheduled_at: string | null;
          priority: CalendarPriority;
          status: CalendarStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          blog_id: string;
          category_id?: string | null;
          language?: string;
          topic: string;
          proposed_title: string;
          keywords?: string[];
          article_type?: string;
          scheduled_at?: string | null;
          priority?: CalendarPriority;
          status?: CalendarStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          blog_id?: string;
          category_id?: string | null;
          language?: string;
          topic?: string;
          proposed_title?: string;
          keywords?: string[];
          article_type?: string;
          scheduled_at?: string | null;
          priority?: CalendarPriority;
          status?: CalendarStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "editorial_calendar_blog_id_fkey";
            columns: ["blog_id"];
            isOneToOne: false;
            referencedRelation: "blogs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "editorial_calendar_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
      content_items: {
        Row: {
          id: string;
          blog_id: string;
          editorial_calendar_id: string | null;
          language: string;
          title: string;
          slug: string;
          excerpt: string | null;
          body: string;
          status: ContentStatus;
          seo_title: string | null;
          meta_description: string | null;
          featured_image_id: string | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          blog_id: string;
          editorial_calendar_id?: string | null;
          language?: string;
          title: string;
          slug: string;
          excerpt?: string | null;
          body?: string;
          status?: ContentStatus;
          seo_title?: string | null;
          meta_description?: string | null;
          featured_image_id?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          blog_id?: string;
          editorial_calendar_id?: string | null;
          language?: string;
          title?: string;
          slug?: string;
          excerpt?: string | null;
          body?: string;
          status?: ContentStatus;
          seo_title?: string | null;
          meta_description?: string | null;
          featured_image_id?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_items_blog_id_fkey";
            columns: ["blog_id"];
            isOneToOne: false;
            referencedRelation: "blogs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_items_editorial_calendar_id_fkey";
            columns: ["editorial_calendar_id"];
            isOneToOne: false;
            referencedRelation: "editorial_calendar";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_items_featured_image_id_fkey";
            columns: ["featured_image_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          }
        ];
      };
      content_sources: {
        Row: {
          id: string;
          content_id: string;
          title: string;
          url: string;
          source_type: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          content_id: string;
          title: string;
          url: string;
          source_type?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          content_id?: string;
          title?: string;
          url?: string;
          source_type?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_sources_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_items";
            referencedColumns: ["id"];
          }
        ];
      };
      media_assets: {
        Row: {
          id: string;
          blog_id: string;
          content_id: string | null;
          type: MediaType;
          storage_path: string;
          public_url: string;
          alt_text: string | null;
          prompt: string | null;
          provider: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          blog_id: string;
          content_id?: string | null;
          type?: MediaType;
          storage_path: string;
          public_url: string;
          alt_text?: string | null;
          prompt?: string | null;
          provider?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          blog_id?: string;
          content_id?: string | null;
          type?: MediaType;
          storage_path?: string;
          public_url?: string;
          alt_text?: string | null;
          prompt?: string | null;
          provider?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_blog_id_fkey";
            columns: ["blog_id"];
            isOneToOne: false;
            referencedRelation: "blogs";
            referencedColumns: ["id"];
          }
        ];
      };
      ai_runs: {
        Row: {
          id: string;
          content_id: string | null;
          agent: string;
          provider: string;
          model: string;
          status: AIRunStatus;
          input_summary: string | null;
          output_summary: string | null;
          estimated_cost: number;
          duration_ms: number;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          content_id?: string | null;
          agent: string;
          provider: string;
          model: string;
          status?: AIRunStatus;
          input_summary?: string | null;
          output_summary?: string | null;
          estimated_cost?: number;
          duration_ms?: number;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          content_id?: string | null;
          agent?: string;
          provider?: string;
          model?: string;
          status?: AIRunStatus;
          input_summary?: string | null;
          output_summary?: string | null;
          estimated_cost?: number;
          duration_ms?: number;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_runs_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_items";
            referencedColumns: ["id"];
          }
        ];
      };
      system_logs: {
        Row: {
          id: string;
          level: LogLevel;
          service: string;
          message: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          level: LogLevel;
          service: string;
          message: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          level?: LogLevel;
          service?: string;
          message?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
