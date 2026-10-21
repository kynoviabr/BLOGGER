import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAuth();
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.from("organization_webhooks").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, webhooks: data ?? [] });
  } catch (err) { const msg = err instanceof Error ? err.message : "Falha"; return NextResponse.json({ success: false, error: msg }, { status: 500 }); }
}
export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({})) as { url?: string; events?: string[] };
    const url = String(body.url || "").trim();
    if (!url.startsWith("https://")) return NextResponse.json({ success: false, error: "url https obrigatória" }, { status: 400 });
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.from("organization_webhooks").insert({ url, events: body.events ?? ["dead_letter"] }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ success: true, webhook: data });
  } catch (err) { const msg = err instanceof Error ? err.message : "Falha"; const s = msg.includes("Insufficient") ? 403 : 500; return NextResponse.json({ success: false, error: msg }, { status: s }); }
}
export async function DELETE(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id obrigatório" }, { status: 400 });
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.from("organization_webhooks").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) { const msg = err instanceof Error ? err.message : "Falha"; return NextResponse.json({ success: false, error: msg }, { status: 500 }); }
}
