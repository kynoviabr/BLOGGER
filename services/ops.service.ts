import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export type OpsMetrics = {
  organization_id: string;
  jobs_by_status: Record<string, number>;
  jobs_by_type_7d: Record<string, number>;
  ai_runs_7d: { total: number; completed: number; failed: number; avg_duration_ms: number; total_cost: number };
  quotas: { monthly_article_limit?: number; monthly_image_limit?: number; articles_this_month?: number; images_this_month?: number; enabled?: boolean };
};

export type OpsJob = {
  id: string;
  job_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  scheduled_at: string;
  blog_id: string | null;
};

export class OpsService {
  static async getMetrics(days = 7): Promise<OpsMetrics> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_ops_metrics" as never, { p_days: days } as never);
    if (error) {
      logger.error("OpsService.getMetrics", "Falha ao carregar métricas", { error });
      throw new Error(error.message);
    }
    return (data as unknown as OpsMetrics) ?? { organization_id: "", jobs_by_status: {}, jobs_by_type_7d: {}, ai_runs_7d: { total: 0, completed: 0, failed: 0, avg_duration_ms: 0, total_cost: 0 }, quotas: {} };
  }

  static async listJobs(filters: { status?: string; job_type?: string; limit?: number } = {}): Promise<OpsJob[]> {
    const supabase = await getSupabaseServerClient();
    let q = supabase.from("background_jobs").select("id,job_type,status,attempts,max_attempts,last_error,created_at,scheduled_at,blog_id").order("created_at", { ascending: false }).limit(filters.limit ?? 50) as unknown as ReturnType<typeof supabase.from>;
    if (filters.status) q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq("status", filters.status);
    if (filters.job_type) q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq("job_type", filters.job_type);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data as unknown as OpsJob[]) ?? [];
  }

  static async listDeadLetters(limit = 20): Promise<OpsJob[]> {
    return this.listJobs({ status: "dead_letter", limit });
  }

  static async retryDeadLetter(jobId: string): Promise<boolean> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("retry_dead_letter_job" as never, { p_job_id: jobId } as never);
    if (error) throw new Error(error.message);
    return Boolean(data);
  }
}
