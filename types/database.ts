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
  | 'publishing'
  | 'publish_failed'
  | 'published'
  | 'archived';
export type MediaType = 'image' | 'video' | 'infographic';
export type AIRunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type OrganizationStatus = 'active' | 'suspended' | 'archived';
export type OrganizationRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type OrganizationMemberStatus = 'invited' | 'active' | 'suspended';
export type BackgroundJobType =
  | 'content_pipeline'
  | 'image_generation'
  | 'publish_content'
  | 'autopilot_tick';
export type BackgroundJobStatus =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'completed'
  | 'dead_letter'
  | 'cancelled';

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: OrganizationStatus;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          status?: OrganizationStatus;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          status?: OrganizationStatus;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          status: OrganizationMemberStatus;
          invited_by: string | null;
          joined_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          status?: OrganizationMemberStatus;
          invited_by?: string | null;
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role?: OrganizationRole;
          status?: OrganizationMemberStatus;
          invited_by?: string | null;
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      organization_invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: Exclude<OrganizationRole, 'owner'>;
          token_hash: string;
          status: 'pending' | 'accepted' | 'revoked' | 'expired';
          invited_by: string;
          expires_at: string;
          accepted_by: string | null;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role: Exclude<OrganizationRole, 'owner'>;
          token_hash: string;
          status?: 'pending' | 'accepted' | 'revoked' | 'expired';
          invited_by: string;
          expires_at: string;
          accepted_by?: string | null;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          role?: Exclude<OrganizationRole, 'owner'>;
          token_hash?: string;
          status?: 'pending' | 'accepted' | 'revoked' | 'expired';
          expires_at?: string;
          accepted_by?: string | null;
          accepted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      blogs: {
        Row: {
          id: string;
          organization_id: string;
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
          autopilot_enabled?: boolean;
          autopilot_start_time?: string;
          autopilot_interval_minutes?: number;
          autopilot_daily_limit?: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
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
          autopilot_enabled?: boolean;
          autopilot_start_time?: string;
          autopilot_interval_minutes?: number;
          autopilot_daily_limit?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
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
          autopilot_enabled?: boolean;
          autopilot_start_time?: string;
          autopilot_interval_minutes?: number;
          autopilot_daily_limit?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blogs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
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
          focus_keyword: string | null;
          tags: string[];
          featured_image_id: string | null;
          published_at: string | null;
          publish_attempts: number;
          publish_claimed_at: string | null;
          publish_original_status: string | null;
          last_publish_error: string | null;
          publish_failure_code: string | null;
          next_publish_attempt_at: string | null;
          external_post_id: string | null;
          external_post_url: string | null;
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
          focus_keyword?: string | null;
          tags?: string[];
          featured_image_id?: string | null;
          published_at?: string | null;
          publish_attempts?: number;
          publish_claimed_at?: string | null;
          publish_original_status?: string | null;
          last_publish_error?: string | null;
          publish_failure_code?: string | null;
          next_publish_attempt_at?: string | null;
          external_post_id?: string | null;
          external_post_url?: string | null;
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
          focus_keyword?: string | null;
          tags?: string[];
          featured_image_id?: string | null;
          published_at?: string | null;
          publish_attempts?: number;
          publish_claimed_at?: string | null;
          publish_original_status?: string | null;
          last_publish_error?: string | null;
          publish_failure_code?: string | null;
          next_publish_attempt_at?: string | null;
          external_post_id?: string | null;
          external_post_url?: string | null;
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
          organization_id: string | null;
          level: LogLevel;
          service: string;
          message: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          level: LogLevel;
          service: string;
          message: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          level?: LogLevel;
          service?: string;
          message?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "system_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      background_jobs: {
        Row: {
          id: string;
          organization_id: string;
          blog_id: string | null;
          job_type: BackgroundJobType;
          status: BackgroundJobStatus;
          payload: Json;
          result: Json | null;
          priority: number;
          attempts: number;
          max_attempts: number;
          idempotency_key: string | null;
          scheduled_at: string;
          claimed_at: string | null;
          claimed_by: string | null;
          lease_expires_at: string | null;
          completed_at: string | null;
          failed_at: string | null;
          last_error: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          blog_id?: string | null;
          job_type: BackgroundJobType;
          status?: BackgroundJobStatus;
          payload?: Json;
          result?: Json | null;
          priority?: number;
          attempts?: number;
          max_attempts?: number;
          idempotency_key?: string | null;
          scheduled_at?: string;
          claimed_at?: string | null;
          claimed_by?: string | null;
          lease_expires_at?: string | null;
          completed_at?: string | null;
          failed_at?: string | null;
          last_error?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          blog_id?: string | null;
          job_type?: BackgroundJobType;
          status?: BackgroundJobStatus;
          payload?: Json;
          result?: Json | null;
          priority?: number;
          attempts?: number;
          max_attempts?: number;
          idempotency_key?: string | null;
          scheduled_at?: string;
          claimed_at?: string | null;
          claimed_by?: string | null;
          lease_expires_at?: string | null;
          completed_at?: string | null;
          failed_at?: string | null;
          last_error?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "background_jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "background_jobs_blog_id_fkey";
            columns: ["blog_id"];
            isOneToOne: false;
            referencedRelation: "blogs";
            referencedColumns: ["id"];
          }
        ];
      };
      background_job_events: {
        Row: {
          id: number;
          job_id: string;
          organization_id: string;
          from_status: string | null;
          to_status: string;
          attempt: number;
          worker_id: string | null;
          message: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          job_id: string;
          organization_id: string;
          from_status?: string | null;
          to_status: string;
          attempt: number;
          worker_id?: string | null;
          message?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: number;
          job_id?: string;
          organization_id?: string;
          from_status?: string | null;
          to_status?: string;
          attempt?: number;
          worker_id?: string | null;
          message?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "background_job_events_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "background_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "background_job_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      monetization_offers: {
        Row: {
          id: string;
          blog_id: string;
          title: string;
          offer_type: 'OWN_PRODUCT' | 'AFFILIATE_CPA' | 'AFFILIATE_TOOL' | 'BOOK_AMAZON';
          category_ids: string[];
          is_global_fallback: boolean;
          pitch_hook: string;
          cta_button_text: string;
          affiliate_url: string;
          badge_text: string | null;
          priority: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          blog_id: string;
          title: string;
          offer_type: 'OWN_PRODUCT' | 'AFFILIATE_CPA' | 'AFFILIATE_TOOL' | 'BOOK_AMAZON';
          category_ids?: string[];
          is_global_fallback?: boolean;
          pitch_hook: string;
          cta_button_text: string;
          affiliate_url: string;
          badge_text?: string | null;
          priority?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          blog_id?: string;
          title?: string;
          offer_type?: 'OWN_PRODUCT' | 'AFFILIATE_CPA' | 'AFFILIATE_TOOL' | 'BOOK_AMAZON';
          category_ids?: string[];
          is_global_fallback?: boolean;
          pitch_hook?: string;
          cta_button_text?: string;
          affiliate_url?: string;
          badge_text?: string | null;
          priority?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monetization_offers_blog_id_fkey";
            columns: ["blog_id"];
            isOneToOne: false;
            referencedRelation: "blogs";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_organization_invitation: {
        Args: { raw_token: string };
        Returns: string;
      };
      enqueue_background_job: {
        Args: {
          p_job_type: string;
          p_payload?: Json;
          p_organization_id?: string | null;
          p_blog_id?: string | null;
          p_idempotency_key?: string | null;
          p_scheduled_at?: string;
          p_priority?: number;
          p_max_attempts?: number;
        };
        Returns: Database['public']['Tables']['background_jobs']['Row'];
      };
      cancel_background_job: {
        Args: { p_job_id: string };
        Returns: boolean;
      };
      claim_background_jobs: {
        Args: { p_worker_id: string; p_limit?: number; p_lease_seconds?: number };
        Returns: Database['public']['Tables']['background_jobs']['Row'][];
      };
      heartbeat_background_job: {
        Args: { p_job_id: string; p_worker_id: string; p_lease_seconds?: number };
        Returns: boolean;
      };
      complete_background_job: {
        Args: { p_job_id: string; p_worker_id: string; p_result?: Json };
        Returns: boolean;
      };
      fail_background_job: {
        Args: { p_job_id: string; p_worker_id: string; p_error: string; p_retryable?: boolean };
        Returns: Database['public']['Tables']['background_jobs']['Row'];
      };
      get_background_job_health: {
        Args: Record<string, never>;
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
