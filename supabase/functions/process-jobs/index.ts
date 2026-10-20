import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

const SERVICE = "EdgeWorker.processJobs";
const BATCH_SIZE = 3;
const LEASE_SECONDS = 600;

class JobFailure extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "JobFailure";
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function publishContent(contentId: string): Promise<JsonRecord> {
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const publishSecret = Deno.env.get("PUBLISH_CRON_SECRET") ?? "";
  if (!projectUrl || !serviceKey || !publishSecret) {
    throw new JobFailure("Supabase publisher secrets are not configured", false);
  }

  const response = await fetch(`${projectUrl}/functions/v1/publish-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "x-cron-secret": publishSecret,
    },
    body: JSON.stringify({ contentId }),
    signal: AbortSignal.timeout(150_000),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    throw new JobFailure(
      `Publisher returned ${response.status}: ${String(payload.error ?? response.statusText)}`,
      response.status === 408 || response.status === 429 || response.status >= 500,
    );
  }

  const results = Array.isArray(payload.results) ? payload.results as JsonRecord[] : [];
  const failure = results.find((result) => String(result.status).startsWith("FAILED"));
  if (failure) {
    throw new JobFailure(
      `Publisher failed: ${String(failure.errorCode ?? failure.status)}`,
      failure.status === "FAILED_RETRY_SCHEDULED",
    );
  }
  return payload;
}

async function executeJob(job: JsonRecord): Promise<JsonRecord> {
  const type = String(job.job_type ?? "");
  const payload = (job.payload ?? {}) as JsonRecord;
  switch (type) {
    case "publish_content": {
      const contentId = String(payload.contentId ?? "");
      if (!contentId) throw new JobFailure("publish_content requires payload.contentId", false);
      return publishContent(contentId);
    }
    default:
      throw new JobFailure(`Handler not enabled for job type: ${type}`, false);
  }
}

export default {
  fetch: async (req: Request) => {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const acceptedSecrets = [
      Deno.env.get("JOB_WORKER_CRON_SECRET"),
      Deno.env.get("PUBLISH_CRON_SECRET"),
    ].filter((secret): secret is string => Boolean(secret));
    if (acceptedSecrets.length === 0 || !acceptedSecrets.includes(req.headers.get("x-cron-secret") ?? "")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as JsonRecord;
    if (body.healthcheck === true) {
      return Response.json({
        ok: true,
        service: SERVICE,
        handlers: ["publish_content"],
        scheduler: "supabase_pg_cron",
      });
    }

    const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!projectUrl || !serviceRoleKey) {
      return Response.json({ error: "Supabase service credentials are not configured" }, { status: 500 });
    }
    const db = createClient(projectUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const workerId = `edge-${crypto.randomUUID()}`;
    const { data: jobs, error: claimError } = await db.rpc("claim_background_jobs", {
      p_worker_id: workerId,
      p_limit: BATCH_SIZE,
      p_lease_seconds: LEASE_SECONDS,
    });
    if (claimError) return Response.json({ error: claimError.message }, { status: 500 });

    const results: JsonRecord[] = [];
    for (const job of (jobs ?? []) as JsonRecord[]) {
      const jobId = String(job.id);
      try {
        const result = await executeJob(job);
        const { data: completed, error } = await db.rpc("complete_background_job", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_result: result,
        });
        if (error || completed !== true) throw new Error(error?.message ?? "Job completion lost its lease");
        results.push({ jobId, status: "completed" });
      } catch (error) {
        const failure = error instanceof JobFailure
          ? error
          : new JobFailure(messageOf(error), true);
        const { data: failedJob, error: failError } = await db.rpc("fail_background_job", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_error: messageOf(failure).slice(0, 4000),
          p_retryable: failure.retryable,
        });
        results.push({
          jobId,
          status: failError ? "transition_failed" : String((failedJob as JsonRecord | null)?.status ?? "failed"),
          error: failError?.message ?? failure.message,
        });
      }
    }

    return Response.json({
      success: true,
      workerId,
      claimed: jobs?.length ?? 0,
      completed: results.filter((result) => result.status === "completed").length,
      results,
    });
  },
};
