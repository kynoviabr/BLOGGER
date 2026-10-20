import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ProviderStatus {
  id: string;
  name: string;
  category: "text" | "image" | "publisher";
  isConfigured: boolean;
  status: "connected" | "error" | "unconfigured" | "testing";
  latencyMs?: number;
  balance?: string;
  errorMessage?: string;
  details?: Record<string, unknown>;
  links: {
    consoleUrl: string;
    billingUrl: string;
    settingsUrl?: string;
    docsUrl: string;
  };
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const specificProvider = searchParams.get("provider");
  const supabase = await getSupabaseServerClient();
  const { data: storedCredentials } = await supabase.rpc("list_provider_credentials" as never, {} as never);
  const credentials = Array.isArray(storedCredentials) ? storedCredentials as Array<{
    organization_id: string; provider: string; model?: string; base_url?: string; configured: boolean;
  }> : [];
  const storedProviders = new Set(credentials.map((credential) => credential.provider));
  const organizationId = credentials[0]?.organization_id;

  const providers: ProviderStatus[] = [
    {
      id: "gemini",
      name: "Google Gemini",
      category: "text",
      isConfigured: storedProviders.has("gemini") || !!process.env.GEMINI_API_KEY,
      status: storedProviders.has("gemini") || process.env.GEMINI_API_KEY ? "testing" : "unconfigured",
      links: {
        consoleUrl: "https://aistudio.google.com/app/apikey",
        billingUrl: "https://console.cloud.google.com/billing",
        docsUrl: "https://ai.google.dev/pricing",
      },
    },
    {
      id: "together",
      name: "Together AI (FLUX.1.1-pro)",
      category: "image",
      isConfigured: storedProviders.has("together") || !!process.env.TOGETHER_API_KEY,
      status: storedProviders.has("together") || process.env.TOGETHER_API_KEY ? "testing" : "unconfigured",
      links: {
        consoleUrl: "https://api.together.ai/settings/api-keys",
        billingUrl: "https://api.together.ai/settings/billing",
        settingsUrl: "https://api.together.ai/settings",
        docsUrl: "https://docs.together.ai/",
      },
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      category: "text",
      isConfigured: storedProviders.has("deepseek") || !!process.env.DEEPSEEK_API_KEY,
      status: storedProviders.has("deepseek") || process.env.DEEPSEEK_API_KEY ? "testing" : "unconfigured",
      links: {
        consoleUrl: "https://platform.deepseek.com/api_keys",
        billingUrl: "https://platform.deepseek.com/top_up",
        docsUrl: "https://api-docs.deepseek.com/",
      },
    },
    {
      id: "openai",
      name: "OpenAI",
      category: "image",
      isConfigured: storedProviders.has("openai") || !!process.env.OPENAI_API_KEY,
      status: storedProviders.has("openai") || process.env.OPENAI_API_KEY ? "testing" : "unconfigured",
      links: {
        consoleUrl: "https://platform.openai.com/api-keys",
        billingUrl: "https://platform.openai.com/settings/organization/billing/overview",
        docsUrl: "https://platform.openai.com/docs",
      },
    },
    {
      id: "wordpress",
      name: "WordPress REST API",
      category: "publisher",
      isConfigured: !!(process.env.WORDPRESS_SITE_URL && process.env.WORDPRESS_APPLICATION_PASSWORD),
      status: !process.env.WORDPRESS_SITE_URL ? "unconfigured" : "testing",
      links: {
        consoleUrl: process.env.WORDPRESS_SITE_URL ? `${process.env.WORDPRESS_SITE_URL.replace(/\/+$/, '')}/wp-admin/` : "https://wordpress.org",
        billingUrl: process.env.WORDPRESS_SITE_URL ? `${process.env.WORDPRESS_SITE_URL.replace(/\/+$/, '')}/wp-admin/plugins.php` : "https://wordpress.org",
        docsUrl: "https://developer.wordpress.org/rest-api/",
      },
    },
  ];

  const results = await Promise.all(
    providers.map(async (provider) => {
      if (specificProvider && provider.id !== specificProvider) {
        return provider;
      }
      if (!provider.isConfigured) {
        return provider;
      }

      const start = Date.now();

      try {
        let tenantKey: string | undefined;
        if (organizationId && storedProviders.has(provider.id)) {
          const admin = getSupabaseAdminClient();
          const { data: runtimeConfig, error: runtimeError } = await admin.rpc(
            "get_provider_runtime_config" as never,
            { p_organization_id: organizationId, p_provider: provider.id } as never
          );
          if (runtimeError) throw runtimeError;
          tenantKey = (runtimeConfig as { apiKey?: string } | null)?.apiKey;
        }
        if (provider.id === "gemini") {
          const key = tenantKey || process.env.GEMINI_API_KEY!;
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          const latencyMs = Date.now() - start;

          if (res.ok) {
            return {
              ...provider,
              status: "connected" as const,
              latencyMs,
              balance: "Free Tier Ativo (15 RPM / 1.500 RPD)",
            };
          } else {
            const err = await res.json().catch(() => ({}));
            return {
              ...provider,
              status: "error" as const,
              latencyMs,
              errorMessage: err.error?.message || `Erro HTTP ${res.status}`,
            };
          }
        }

        if (provider.id === "together") {
          const key = tenantKey || process.env.TOGETHER_API_KEY!;
          const res = await fetch("https://api.together.xyz/v1/models", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${key}`,
            },
            signal: AbortSignal.timeout(8000),
          });
          const latencyMs = Date.now() - start;

          if (res.ok) {
            return {
              ...provider,
              status: "connected" as const,
              latencyMs,
              balance: "Ativo (Cobrança por imagem Serverless)",
            };
          } else {
            const err = await res.json().catch(() => ({}));
            return {
              ...provider,
              status: "error" as const,
              latencyMs,
              errorMessage: err.error?.message || `Erro HTTP ${res.status}`,
            };
          }
        }

        if (provider.id === "deepseek") {
          const key = tenantKey || process.env.DEEPSEEK_API_KEY!;
          const res = await fetch("https://api.deepseek.com/user/balance", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${key}`,
            },
            signal: AbortSignal.timeout(8000),
          });
          const latencyMs = Date.now() - start;

          if (res.ok) {
            const data = await res.json();
            const totalBalance = data.balance_infos?.[0]?.total_balance || "0.00";
            const currency = data.balance_infos?.[0]?.currency || "USD";
            return {
              ...provider,
              status: "connected" as const,
              latencyMs,
              balance: `${currency} $${totalBalance}`,
            };
          } else {
            const err = await res.json().catch(() => ({}));
            return {
              ...provider,
              status: "error" as const,
              latencyMs,
              errorMessage: err.error?.message || `Erro HTTP ${res.status}`,
            };
          }
        }

        if (provider.id === "openai") {
          const key = tenantKey || process.env.OPENAI_API_KEY!;
          const res = await fetch("https://api.openai.com/v1/models", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${key}`,
            },
            signal: AbortSignal.timeout(8000),
          });
          const latencyMs = Date.now() - start;

          if (res.ok) {
            return {
              ...provider,
              status: "connected" as const,
              latencyMs,
              balance: "Conta Ativa",
            };
          } else {
            const err = await res.json().catch(() => ({}));
            return {
              ...provider,
              status: "error" as const,
              latencyMs,
              errorMessage: err.error?.message || `Erro HTTP ${res.status}`,
            };
          }
        }

        if (provider.id === "wordpress") {
          const siteUrl = (process.env.WORDPRESS_SITE_URL || "").replace(/\/+$/, "");
          const username = process.env.WORDPRESS_USERNAME || "";
          const appPass = process.env.WORDPRESS_APPLICATION_PASSWORD || "";

          const authHeader = `Basic ${Buffer.from(`${username}:${appPass}`).toString("base64")}`;
          const res = await fetch(`${siteUrl}/wp-json/wp/v2/users/me`, {
            method: "GET",
            headers: {
              Authorization: authHeader,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(10000),
          });
          const latencyMs = Date.now() - start;

          if (res.ok) {
            const user = await res.json();
            return {
              ...provider,
              status: "connected" as const,
              latencyMs,
              balance: `Autenticado: ${user.name || username}`,
            };
          } else {
            return {
              ...provider,
              status: "error" as const,
              latencyMs,
              errorMessage: `Falha HTTP ${res.status} ao conectar no WordPress`,
            };
          }
        }

        return provider;
      } catch (err: unknown) {
        return {
          ...provider,
          status: "error" as const,
          latencyMs: Date.now() - start,
          errorMessage: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  return NextResponse.json({ providers: results });
}
