import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { OpsService } from "@/services/ops.service";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAuth();
    const jobs = await OpsService.listDeadLetters(20);
    return NextResponse.json({ success: true, jobs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
