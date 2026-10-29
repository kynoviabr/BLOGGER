import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";

// Antecedência (em dias) com que as pautas agendadas viram artigo pronto para revisão.
export async function GET() {
  try {
    await requireAuth();
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_production_settings" as never);
    if (error) throw error;
    return NextResponse.json({ success: true, settings: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = (await request.json().catch(() => ({}))) as { production_lead_days?: unknown };
    const days = Number(body.production_lead_days);
    if (!Number.isInteger(days) || days < 0 || days > 14) {
      return NextResponse.json({ success: false, error: "Use um número de 0 a 14 dias." }, { status: 400 });
    }
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("set_production_lead_days" as never, { p_days: days } as never);
    if (error) throw error;
    return NextResponse.json({ success: true, settings: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha";
    const status = msg.includes("Insufficient") ? 403 : 500;
    return NextResponse.json({ success: false, error: status === 403 ? "Só owner ou admin pode mudar." : msg }, { status });
  }
}
