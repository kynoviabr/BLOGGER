import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAuth();
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_organization_quota_usage" as never);
    if (error) throw error;
    return NextResponse.json({ success: true, quotas: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
export async function POST(request: Request) {
  const rl = checkRateLimit(rateLimitKey(request, "quotas"), 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ success: false, error: "Muitas tentativas" }, { status: 429 });
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("upsert_organization_quotas" as never, {
      p_monthly_article_limit: body.monthly_article_limit ?? null,
      p_monthly_image_limit: body.monthly_image_limit ?? null,
      p_monthly_token_limit: body.monthly_token_limit ?? null,
      p_enabled: body.enabled ?? null,
    } as never);
    if (error) throw error;
    return NextResponse.json({ success: true, quotas: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha";
    const status = msg.includes("Insufficient") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
