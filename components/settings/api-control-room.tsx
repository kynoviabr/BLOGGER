"use client";

import * as React from "react";
import {
  Key,
  CreditCard,
  BookOpen,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Cpu,
  Image as ImageIcon,
  Globe,
  Sparkles,
  Zap,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ProviderInfo {
  id: string;
  name: string;
  category: "text" | "image" | "publisher";
  isConfigured: boolean;
  status: "connected" | "error" | "unconfigured" | "testing";
  latencyMs?: number;
  balance?: string;
  errorMessage?: string;
  links: {
    consoleUrl: string;
    billingUrl: string;
    settingsUrl?: string;
    docsUrl: string;
  };
}

export function ApiControlRoom() {
  const [providers, setProviders] = React.useState<ProviderInfo[]>([
    {
      id: "gemini",
      name: "Google Gemini",
      category: "text",
      isConfigured: false,
      status: "unconfigured",
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
      isConfigured: false,
      status: "unconfigured",
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
      isConfigured: false,
      status: "unconfigured",
      links: {
        consoleUrl: "https://platform.deepseek.com/api_keys",
        billingUrl: "https://platform.deepseek.com/top_up",
        docsUrl: "https://api-docs.deepseek.com/",
      },
    },
    {
      id: "openai",
      name: "OpenAI (DALL-E)",
      category: "image",
      isConfigured: false,
      status: "unconfigured",
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
      isConfigured: false,
      status: "unconfigured",
      links: {
        consoleUrl: "https://wordpress.org",
        billingUrl: "https://wordpress.org",
        docsUrl: "https://developer.wordpress.org/rest-api/",
      },
    },
  ]);

  const [isLoadingAll, setIsLoadingAll] = React.useState(false);
  const [testingProviderId, setTestingProviderId] = React.useState<string | null>(null);

  const fetchStatus = React.useCallback(async (providerId?: string) => {
    if (providerId) {
      setTestingProviderId(providerId);
    } else {
      setIsLoadingAll(true);
    }

    try {
      const url = providerId
        ? `/api/settings/api-status?provider=${providerId}`
        : "/api/settings/api-status";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.providers) {
          setProviders((prev) =>
            prev.map((item) => {
              const updated = data.providers.find((p: ProviderInfo) => p.id === item.id);
              return updated || item;
            })
          );
        }
      }
    } catch (err) {
      console.error("Falha ao consultar status das APIs:", err);
    } finally {
      setIsLoadingAll(false);
      setTestingProviderId(null);
    }
  }, []);

  React.useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "text":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-400 border border-indigo-500/20">
            <Cpu className="h-3 w-3" /> Texto & Pautas
          </span>
        );
      case "image":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
            <ImageIcon className="h-3 w-3" /> Imagens
          </span>
        );
      case "publisher":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/20">
            <Globe className="h-3 w-3" /> Publicador
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-brand-card border border-border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Sala de Controle das APIs
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Monitore a saúde das conexões, consulte saldos de créditos e acesse rapidamente as contas de faturamento de cada provedor.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchStatus()}
          disabled={isLoadingAll}
          className="gap-2 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoadingAll ? "animate-spin" : ""}`} />
          {isLoadingAll ? "Verificando..." : "Testar Todas as APIs"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {providers.map((provider) => {
          const isTesting = testingProviderId === provider.id;

          return (
            <Card key={provider.id} className="relative overflow-hidden flex flex-col justify-between">
              <div>
                <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold">{provider.name}</CardTitle>
                      {getCategoryBadge(provider.category)}
                    </div>
                    <CardDescription className="text-xs">
                      {provider.id === "gemini" && "Motor para redação, ideação e análise de escopo YMYL."}
                      {provider.id === "together" && "Motor Serverless para FLUX.2, FLUX Schnell e Nano Banana."}
                      {provider.id === "deepseek" && "Motor de redação profunda e Quality Gate de palavras."}
                      {provider.id === "openai" && "Motor para DALL-E e gpt-image-1-mini."}
                      {provider.id === "wordpress" && "Integração oficial via REST API e Application Password."}
                    </CardDescription>
                  </div>
                  <div>
                    {provider.status === "connected" && (
                      <Badge variant="success" className="gap-1.5 py-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        Conectado
                      </Badge>
                    )}
                    {provider.status === "error" && (
                      <Badge variant="error" className="gap-1.5 py-1">
                        <XCircle className="h-3.5 w-3.5 text-rose-400" />
                        Erro de Conexão
                      </Badge>
                    )}
                    {provider.status === "unconfigured" && (
                      <Badge variant="outline" className="gap-1.5 py-1 text-muted-foreground">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Não Configurada
                      </Badge>
                    )}
                    {provider.status === "testing" && (
                      <Badge variant="info" className="gap-1.5 py-1 animate-pulse">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Verificando
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  {/* Informações de Saldo e Latência */}
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                    <div>
                      <span className="block text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                        Saldo / Plano
                      </span>
                      <span className="font-medium text-foreground mt-0.5 block truncate">
                        {provider.balance || (provider.isConfigured ? "Verificando..." : "N/A")}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                        Latência da API
                      </span>
                      <span className="font-mono text-foreground mt-0.5 block">
                        {provider.latencyMs !== undefined ? `${provider.latencyMs}ms` : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Mensagem de Erro, se houver */}
                  {provider.errorMessage && (
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5 text-xs text-rose-400 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{provider.errorMessage}</span>
                    </div>
                  )}

                  {/* Links de Atalho: Console, Billing e Docs */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                      Atalhos Oficiais
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={provider.links.consoleUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <Key className="h-3 w-3 text-primary" />
                        Chaves de API
                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </a>
                      <a
                        href={provider.links.billingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <CreditCard className="h-3 w-3 text-emerald-400" />
                        Faturamento / Saldo
                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </a>
                      {provider.links.settingsUrl && (
                        <a
                          href={provider.links.settingsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <Shield className="h-3 w-3 text-sky-400" />
                          Privacidade & Ajustes
                          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                        </a>
                      )}
                      <a
                        href={provider.links.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <BookOpen className="h-3 w-3" />
                        Docs
                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </a>
                    </div>
                  </div>
                </CardContent>
              </div>

              <div className="border-t border-border p-4 bg-muted/10 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-mono">
                  {provider.isConfigured ? "Chave detectada no ambiente" : "Chave ausente no ambiente"}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchStatus(provider.id)}
                  disabled={isTesting || !provider.isConfigured}
                  className="h-7 text-xs gap-1.5"
                >
                  <RefreshCw className={`h-3 w-3 ${isTesting ? "animate-spin" : ""}`} />
                  {isTesting ? "Testando..." : "Testar Conexão"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
