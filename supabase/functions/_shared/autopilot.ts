import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export class AutopilotError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "AutopilotError";
  }
}

export async function autopilotTickJob(payload: JsonRecord, db?: SupabaseClient): Promise<JsonRecord> {
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const client = db ?? createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const organizationId = String(payload.organizationId ?? "");
  // If no org specified, this tick is a no-op (cron should enqueue per-org instead)
  if (!organizationId) {
    const { data: orgs } = await client.from("organizations").select("id").eq("status", "active").limit(50);
    let enqueued = 0;
    for (const org of (orgs ?? []) as Array<{ id: string }>) {
      const { error } = await client.rpc("enqueue_background_job", {
        p_job_type: "autopilot_tick",
        p_payload: { organizationId: org.id },
        p_organization_id: org.id,
        p_priority: 90,
        p_max_attempts: 2,
      } as never);
      if (!error) enqueued++;
    }
    return { fanout: true, enqueued };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();

  const { data: blogs, error: blogsErr } = await client.from("blogs").select("id,name,editorial_config,autopilot_enabled,autopilot_start_time,autopilot_interval_minutes,autopilot_daily_limit").eq("organization_id", organizationId).eq("status", "active");
  if (blogsErr) throw new AutopilotError(`Falha ao consultar blogs: ${blogsErr.message}`, true);
  if (!blogs || blogs.length === 0) return { organizationId, blogsChecked: 0, enqueued: 0 };

  let enqueued = 0;
  for (const blog of blogs as unknown as Array<Record<string, unknown>>) {
    const edConfig = ((blog.editorial_config as Record<string, unknown> | null)?.autopilot as Record<string, unknown> | undefined) ?? {};
    const isEnabled = (blog.autopilot_enabled as boolean | null) ?? (edConfig.autopilot_enabled as boolean | undefined) ?? false;
    if (!isEnabled) continue;

    const startTimeStr = String(blog.autopilot_start_time ?? edConfig.autopilot_start_time ?? "06:00");
    const intervalMinutes = Number(blog.autopilot_interval_minutes ?? edConfig.autopilot_interval_minutes ?? 30);
    const dailyLimit = Number(blog.autopilot_daily_limit ?? edConfig.autopilot_daily_limit ?? 5);

    const [sh, sm] = startTimeStr.split(":").map((v) => parseInt(v, 10) || 0);
    const startMins = sh * 60 + sm;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    if (nowMins < startMins) continue;

    const { count: publishedToday } = await client.from("content_items").select("id", { count: "exact", head: true }).eq("blog_id", String(blog.id)).eq("status", "published").gte("published_at", startOfToday);
    if ((publishedToday ?? 0) >= dailyLimit) continue;

    const { data: lastPublished } = await client.from("content_items").select("published_at").eq("blog_id", String(blog.id)).eq("status", "published").order("published_at", { ascending: false }).limit(1).maybeSingle();
    if (lastPublished && (lastPublished as { published_at: string }).published_at) {
      const elapsed = (now.getTime() - new Date((lastPublished as { published_at: string }).published_at).getTime()) / 60000;
      if (elapsed < intervalMinutes) continue;
    }

    const { data: candidates } = await client.from("editorial_calendar").select("id,proposed_title,topic").eq("blog_id", String(blog.id)).in("status", ["PLANNED", "READY"]).order("scheduled_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(1);
    const target = (candidates ?? [])[0] as { id: string; proposed_title?: string; topic?: string } | undefined;
    if (!target) continue;

    // Enqueue content_pipeline for this pauta
    let contentId: string | null = null;
    const { data: existing } = await client.from("content_items").select("id").eq("editorial_calendar_id", target.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) contentId = (existing as { id: string }).id;
    else {
      const { data: inserted, error: insErr } = await client.from("content_items").insert({ blog_id: String(blog.id), editorial_calendar_id: target.id, title: target.proposed_title || target.topic || "Gerando...", slug: `autopilot-${Date.now()}`, body: "", status: "draft", language: "pt-BR" }).select("id").single();
      if (insErr || !inserted) continue;
      contentId = (inserted as { id: string }).id;
    }

    const { error: enqErr } = await client.rpc("enqueue_background_job", {
      p_job_type: "content_pipeline",
      p_payload: { contentId, calendarId: target.id, language: "pt-BR", requestedBy: "autopilot" },
      p_organization_id: organizationId,
      p_blog_id: String(blog.id),
      p_idempotency_key: `autopilot:${target.id}:${contentId}`.slice(0, 200),
      p_priority: 50,
      p_max_attempts: 3,
    } as never);
    if (!enqErr) enqueued++;
  }

  await client.from("system_logs").insert({ organization_id: organizationId, level: "info", service: "EdgeWorker.autopilotTick", message: `Autopilot tick: ${enqueued} pautas enfileiradas`, metadata: { organizationId, enqueued } });
  return { organizationId, enqueued };
}
