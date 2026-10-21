import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { OpsService } from "@/services/ops.service";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rl = checkRateLimit(rateLimitKey(request, "jobs-retry"), 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ success: false, error: "Muitas tentativas" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({})) as { jobId?: string };
    const jobId = String(body.jobId || "").trim();
    if (!jobId) return NextResponse.json({ success: false, error: "jobId obrigatório" }, { status: 400 });
    const ok = await OpsService.retryDeadLetter(jobId);
    if (!ok) return NextResponse.json({ success: false, error: "Job não é dead_letter ou sem permissão (owner/admin)" }, { status: 403 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha ao reprocessar";
    const status = msg.includes("Insufficient") || msg.includes("access") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
