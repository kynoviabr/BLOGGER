import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: blogId } = await params;
  try {
    await requireAuth();
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_blog_wordpress_credentials" as never, { p_blog_id: blogId } as never);
    if (error) throw error;
    const row = Array.isArray(data) ? (data as unknown[])[0] : data;
    return NextResponse.json({ success: true, credential: row ?? null });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Falha ao consultar credencial WordPress.";
    const status = msg.includes("Insufficient") || msg.includes("access") ? 403 : msg.includes("Auth") ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: blogId } = await params;
  try {
    await requireAuth();
    const body = await request.json();
    const siteUrl = typeof body.siteUrl === "string" ? body.siteUrl.trim() : "";
    const wpUsername = typeof body.wpUsername === "string" ? body.wpUsername.trim() : "";
    const wpPassword = typeof body.wpApplicationPassword === "string" ? body.wpApplicationPassword.trim() : typeof body.applicationPassword === "string" ? body.applicationPassword.trim() : "";
    if (!siteUrl || !siteUrl.startsWith("https://") || !wpUsername || wpPassword.length < 8) {
      return NextResponse.json({ success: false, error: "siteUrl (https), wpUsername e wpApplicationPassword (≥8 chars) são obrigatórios." }, { status: 400 });
    }
    // Validate credential before storing: try WordPress auth preflight
    try {
      const auth = `Basic ${Buffer.from(`${wpUsername}:${wpPassword}`).toString("base64")}`;
      const check = await fetch(`${siteUrl.replace(/\/+$/, "")}/wp-json/wp/v2/users/me?context=edit`, { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!check.ok) {
        const j = await check.json().catch(() => ({})) as { message?: string };
        return NextResponse.json({ success: false, error: `WordPress rejeitou a credencial (${check.status}): ${j.message ?? check.statusText}` }, { status: 422 });
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.includes("422") || m.includes("rejeitou")) throw e;
      // network timeout: warn but still allow save — worker will retry
    }

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("upsert_blog_wordpress_credentials" as never, {
      p_blog_id: blogId, p_site_url: siteUrl, p_wp_username: wpUsername, p_wp_application_password: wpPassword, p_enabled: true,
    } as never);
    if (error) throw error;
    const row = Array.isArray(data) ? (data as unknown[])[0] : data;

    // Best-effort: remove plaintext from editorial_config.wordpress if present
    try {
      const admin = getSupabaseAdminClient();
      const { data: blog } = await admin.from("blogs").select("editorial_config").eq("id", blogId).maybeSingle();
      const ed = (blog?.editorial_config as Record<string, unknown> | null) ?? {};
      const wp = (ed.wordpress as Record<string, unknown> | undefined);
      if (wp?.wp_application_password) {
        const { wp_application_password: _omit, ...rest } = wp;
        await admin.from("blogs").update({ editorial_config: { ...ed, wordpress: rest } }).eq("id", blogId);
      }
    } catch {}

    return NextResponse.json({ success: true, credential: row });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Falha ao salvar credencial WordPress.";
    const forbidden = msg.includes("owners") || msg.includes("admins") || msg.includes("Insufficient") || msg.includes("access");
    return NextResponse.json({ success: false, error: msg }, { status: forbidden ? 403 : 500 });
  }
}
