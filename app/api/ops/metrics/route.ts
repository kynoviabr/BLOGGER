import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { OpsService } from "@/services/ops.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const days = Math.min(30, Math.max(1, parseInt(searchParams.get("days") || "7", 10) || 7));
    const metrics = await OpsService.getMetrics(days);
    return NextResponse.json({ success: true, metrics });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha ao carregar métricas";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
