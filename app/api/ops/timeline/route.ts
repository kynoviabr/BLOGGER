import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    const contentId = searchParams.get("contentId");
    if (!jobId && !contentId) return NextResponse.json({ success: false, error: "jobId ou contentId obrigatório" }, { status: 400 });
    const supabase = await getSupabaseServerClient();
    const payload: Record<string, unknown> = {};
    if (jobId) {
      const { data: job } = await supabase.from("background_jobs").select("id,job_type,status,payload,result,attempts,max_attempts,last_error,created_at,updated_at").eq("id", jobId).maybeSingle();
      const { data: events } = await supabase.from("background_job_events").select("*").eq("job_id", jobId).order("created_at", { ascending: true });
      const cid = (job as unknown as { payload?: { contentId?: string } } | null)?.payload?.contentId as string | undefined;
      let aiRuns: unknown[] = [];
      let logs: unknown[] = [];
      if (cid) {
        const { data: runs } = await supabase.from("ai_runs").select("*").eq("content_id", cid).order("created_at", { ascending: true });
        aiRuns = runs ?? [];
        const { data: sysLogs } = await supabase.from("system_logs").select("*").eq("metadata->>contentId", cid).order("created_at", { ascending: true }).limit(20);
        logs = sysLogs ?? [];
      }
      return NextResponse.json({ success: true, job, events: events ?? [], aiRuns, logs });
    }
    // contentId mode: aggregate all jobs for that content
    const { data: jobs } = await supabase.from("background_jobs").select("id,job_type,status,attempts,last_error,created_at").eq("payload->>contentId", contentId!).order("created_at", { ascending: true });
    const { data: runs } = await supabase.from("ai_runs").select("*").eq("content_id", contentId!).order("created_at", { ascending: true });
    const { data: sysLogs } = await supabase.from("system_logs").select("*").eq("metadata->>contentId", contentId!).order("created_at", { ascending: true }).limit(30);
    return NextResponse.json({ success: true, jobs: jobs ?? [], aiRuns: runs ?? [], logs: sysLogs ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
