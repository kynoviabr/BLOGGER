import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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

  const providers: ProviderStatus[] = [
    {
      id: "gemini",
      name: "Google Gemini",
      category: "text",
      isConfigured: !!process.env.GEMINI_API_KEY,
      status: !process.env.GEMINI_API_KEY ? "unconfigured" : "testing",
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
      isConfigured: !!process.env.TOGETHER_API_KEY,
      status: !process.env.TOGETHER_API_KEY ? "unconfigured" : "testing",
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
      isConfigured: !!process.env.DEEPSEEK_API_KEY,
      status: !process.env.DEEPSEEK_API_KEY ? "unconfigured" : "testing",
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
      isConfigured: !!process.env.OPENAI_API_KEY,
      status: !process.env.OPENAI_API_KEY ? "unconfigured" : "testing",
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
        if (provider.id === "gemini") {
          const key = process.env.GEMINI_API_KEY!;
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
          const key = process.env.TOGETHER_API_KEY!;
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
          const key = process.env.DEEPSEEK_API_KEY!;
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
          const key = process.env.OPENAI_API_KEY!;
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
