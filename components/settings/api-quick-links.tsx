"use client";

import * as React from "react";
import {
  Key,
  CreditCard,
  BookOpen,
  ExternalLink,
  Shield,
  Database,
  Cloud,
  Globe,
  Cpu,
  Sparkles,
  Settings as SettingsIcon,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ApiQuickLinks() {
  const portals = [
    {
      id: "together",
      name: "Together AI",
      badge: "FLUX.1.1-pro & Llama 3.3",
      category: "Imagens & LLM",
      badgeVariant: "success" as const,
      description: "Motor ultra-rápido para geração de imagens fotorrealistas e modelos de linguagem de código aberto.",
      links: [
        { label: "Chaves de API", href: "https://api.together.ai/settings/api-keys", icon: Key, primary: true },
        { label: "Faturamento & Saldo", href: "https://api.together.ai/settings/billing", icon: CreditCard, primary: false },
        { label: "Privacidade & Modelos", href: "https://api.together.ai/settings", icon: Shield, primary: false },
        { label: "Docs da API", href: "https://docs.together.ai/", icon: BookOpen, primary: false },
      ],
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      badge: "DeepSeek-V3",
      category: "Redação Editorial",
      badgeVariant: "info" as const,
      description: "Motor principal de escrita de artigos em português com profundidade analítica e SEO estruturado.",
      links: [
        { label: "Chaves de API", href: "https://platform.deepseek.com/api_keys", icon: Key, primary: true },
        { label: "Recarregar Saldo", href: "https://platform.deepseek.com/top_up", icon: CreditCard, primary: false },
        { label: "Docs da API", href: "https://api-docs.deepseek.com/", icon: BookOpen, primary: false },
      ],
    },
    {
      id: "gemini",
      name: "Google Gemini",
      badge: "Gemini 2.5 Flash / Pro",
      category: "Ideação & Pesquisa",
      badgeVariant: "info" as const,
      description: "Pesquisa factual com busca em tempo real, geração e aprimoramento de pautas e conformidade YMYL.",
      links: [
        { label: "Google AI Studio", href: "https://aistudio.google.com/app/apikey", icon: Key, primary: true },
        { label: "Google Cloud Billing", href: "https://console.cloud.google.com/billing", icon: CreditCard, primary: false },
        { label: "Tabela de Preços", href: "https://ai.google.dev/pricing", icon: BookOpen, primary: false },
      ],
    },
    {
      id: "openai",
      name: "OpenAI",
      badge: "DALL-E & Mini",
      category: "Imagens Alternativas",
      badgeVariant: "outline" as const,
      description: "Provedor alternativo para geração de imagens conceituais e miniaturas de artigos.",
      links: [
        { label: "Chaves de API", href: "https://platform.openai.com/api-keys", icon: Key, primary: true },
        { label: "Faturamento & Limites", href: "https://platform.openai.com/settings/organization/billing/overview", icon: CreditCard, primary: false },
        { label: "Docs OpenAI", href: "https://platform.openai.com/docs", icon: BookOpen, primary: false },
      ],
    },
    {
      id: "supabase",
      name: "Supabase",
      badge: "Postgres + pg_cron",
      category: "Banco & Agendador",
      badgeVariant: "success" as const,
      description: "Infraestrutura de banco de dados, storage WebP e agendamento nativo autônomo a cada 5 minutos.",
      links: [
        { label: "Painel Supabase", href: "https://supabase.com/dashboard", icon: Database, primary: true },
        { label: "SQL Editor (pg_cron)", href: "https://supabase.com/dashboard", icon: Layers, primary: false },
        { label: "Faturamento da Conta", href: "https://supabase.com/dashboard/account/billing", icon: CreditCard, primary: false },
      ],
    },
    {
      id: "vercel",
      name: "Vercel",
      badge: "Deploys & Produção",
      category: "Hospedagem & Env",
      badgeVariant: "outline" as const,
      description: "Plataforma de execução Next.js em produção e gerenciamento de variáveis de ambiente.",
      links: [
        { label: "Dashboard do Projeto", href: "https://vercel.com/dashboard", icon: Cloud, primary: true },
        { label: "Variáveis de Ambiente", href: "https://vercel.com/kynoviabrs-projects/blogger/settings/environment-variables", icon: Key, primary: false },
        { label: "Uso e Métricas", href: "https://vercel.com/dashboard/usage", icon: CreditCard, primary: false },
      ],
    },
    {
      id: "wordpress",
      name: "WordPress",
      badge: "CMS de Publicação",
      category: "Publicação Final",
      badgeVariant: "outline" as const,
      description: "Destino final dos artigos com aplicação automática de SEO, categorias, tags e monetização.",
      links: [
        { label: "Painel WP-Admin", href: process.env.NEXT_PUBLIC_WP_URL || "https://universododinheiro.com.br/wp-admin/", icon: Globe, primary: true },
        { label: "Gerenciar Plugins", href: "https://universododinheiro.com.br/wp-admin/plugins.php", icon: SettingsIcon, primary: false },
        { label: "REST API Docs", href: "https://developer.wordpress.org/rest-api/", icon: BookOpen, primary: false },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" />
          Central de Acesso Rápido às Contas & Faturamento
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Links diretos para gerenciar credenciais, adicionar créditos, verificar consumo e configurar permissões em cada plataforma.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {portals.map((portal) => (
          <Card key={portal.id} className="flex flex-col justify-between border-border/80 hover:border-primary/40 transition-colors bg-card">
            <CardHeader className="pb-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  {portal.name}
                </CardTitle>
                <Badge variant={portal.badgeVariant} className="text-[10px] py-0 px-1.5">
                  {portal.badge}
                </Badge>
              </div>
              <CardDescription className="text-xs line-clamp-2">
                {portal.description}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-0 pb-3.5 space-y-2">
              <div className="grid grid-cols-1 gap-1.5">
                {portal.links.map((link, idx) => {
                  const Icon = link.icon;
                  return (
                    <a
                      key={idx}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                        link.primary
                          ? "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                          : "bg-muted/40 text-foreground hover:bg-muted/80 border border-border/60"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 opacity-80" />
                        {link.label}
                      </span>
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
