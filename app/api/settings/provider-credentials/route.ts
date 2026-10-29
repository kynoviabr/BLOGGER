import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

const SUPPORTED_PROVIDERS = new Set(["deepseek", "gemini", "openai", "together"]);

export async function GET() {
  try {
    await requireAuth();
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_provider_credentials" as never, {} as never);
    if (error) throw error;
    return NextResponse.json({ success: true, credentials: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar as credenciais.";
    return NextResponse.json({ success: false, error: message }, { status: message.includes("Auth") ? 401 : 500 });
  }
}

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(rateLimitKey(request, "provider-credentials"), 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ success: false, error: "Muitas tentativas. Tente novamente em instantes." }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });
  try {
    const auth = await requireAuth();
    const body = await request.json();
    const provider = typeof body.provider === "string" ? body.provider.toLowerCase().trim() : "";
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : null;
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : null;
    if (!SUPPORTED_PROVIDERS.has(provider) || apiKey.length < 8) {
      return NextResponse.json({ success: false, error: "Provedor ou chave inválidos." }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("upsert_provider_credential" as never, {
      p_provider: provider,
      p_api_key: apiKey,
      p_model: model,
      p_base_url: baseUrl,
      p_enabled: true,
    } as never);
    if (error) throw error;
    try {
      const supabase2 = await getSupabaseServerClient();
      await supabase2.from("system_logs").insert({ level: "info", service: "Settings.providerCredentials", message: `Provider credential upsert: ${provider}`, metadata: { provider, actorId: (auth as { id?: string } | null)?.id ?? null } });
    } catch {}
    return NextResponse.json({ success: true, credential: Array.isArray(data) ? data[0] : data });
  } catch (error) {
    // Erros do Supabase (PostgrestError) não são instâncias de Error; sem isso a tela só mostrava a mensagem genérica.
    const raw = (error as { message?: unknown } | null)?.message;
    const message = typeof raw === "string" && raw ? raw : "Não foi possível salvar a credencial.";
    const forbidden = message.includes("owners") || message.includes("admins") || message.includes("access");
    return NextResponse.json({ success: false, error: message }, { status: forbidden ? 403 : 500 });
  }
}
