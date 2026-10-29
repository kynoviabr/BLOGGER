import { CheckCircle2, XCircle, Server, Cpu, UploadCloud, ShieldAlert, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiControlRoom } from "@/components/settings/api-control-room";
import { ApiQuickLinks } from "@/components/settings/api-quick-links";
import { QuotasEditor } from "@/components/settings/quotas-editor";
import { ProductionSettings } from "@/components/settings/production-settings";
import { WebhooksManager } from "@/components/settings/webhooks-manager";

export default function SettingsPage() {
  const envCheck = [
    {
      category: "Banco de Dados & Autenticação",
      icon: Server,
      items: [
        {
          name: "NEXT_PUBLIC_SUPABASE_URL",
          description: "URL da instância Supabase",
          isSet: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          portalUrl: "https://supabase.com/dashboard",
          portalLabel: "Supabase Console",
        },
        {
          name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          description: "Chave pública anônima do Supabase",
          isSet: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          portalUrl: "https://supabase.com/dashboard",
          portalLabel: "Supabase API Keys",
        },
        {
          name: "SUPABASE_SERVICE_ROLE_KEY",
          description: "Chave privada de serviço (admin bypass para workers)",
          isSet: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          portalUrl: "https://supabase.com/dashboard",
          portalLabel: "Supabase Service Role",
        },
      ],
    },
    {
      category: "Pipeline de Inteligência Artificial",
      icon: Cpu,
      items: [
        {
          name: "TOGETHER_API_KEY",
          description: "Chave da Together AI para FLUX.1.1-pro e LLMs",
          isSet: !!process.env.TOGETHER_API_KEY,
          portalUrl: "https://api.together.ai/settings/api-keys",
          portalLabel: "Together API Keys",
        },
        {
          name: "DEEPSEEK_API_KEY",
          description: "Chave do DeepSeek V3 para redação editorial profunda",
          isSet: !!process.env.DEEPSEEK_API_KEY,
          portalUrl: "https://platform.deepseek.com/api_keys",
          portalLabel: "DeepSeek Console",
        },
        {
          name: "GEMINI_API_KEY",
          description: "Chave de acesso à API do Google Gemini (Texto & Ideação)",
          isSet: !!process.env.GEMINI_API_KEY,
          portalUrl: "https://aistudio.google.com/app/apikey",
          portalLabel: "Google AI Studio",
        },
        {
          name: "OPENAI_API_KEY",
          description: "Chave da OpenAI para DALL-E / gpt-image-1-mini",
          isSet: !!process.env.OPENAI_API_KEY,
          portalUrl: "https://platform.openai.com/api-keys",
          portalLabel: "OpenAI Platform",
        },
      ],
    },
    {
      category: "Segurança & Publicação",
      icon: UploadCloud,
      items: [
        {
          name: "CRON_SECRET",
          description: "Token bearer para acionamento de workers via Supabase pg_cron",
          isSet: !!process.env.CRON_SECRET,
          portalUrl: "https://vercel.com/kynoviabrs-projects/blogger/settings/environment-variables",
          portalLabel: "Vercel Env Vars",
        },
        {
          name: "WORDPRESS_SITE_URL",
          description: "URL base do blog WordPress de destino",
          isSet: !!process.env.WORDPRESS_SITE_URL,
          portalUrl: process.env.WORDPRESS_SITE_URL ? `${process.env.WORDPRESS_SITE_URL.replace(/\/+$/, '')}/wp-admin/` : "https://wordpress.org",
          portalLabel: "Painel WP-Admin",
        },
        {
          name: "WORDPRESS_APPLICATION_PASSWORD",
          description: "Senha de aplicativo REST API para publicação",
          isSet: !!process.env.WORDPRESS_APPLICATION_PASSWORD,
          portalUrl: process.env.WORDPRESS_SITE_URL ? `${process.env.WORDPRESS_SITE_URL.replace(/\/+$/, '')}/wp-admin/profile.php` : "https://wordpress.org",
          portalLabel: "WP Senhas de App",
        },
      ],
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl">
      <PageHeader
        title="Configurações & Sala de Controle das APIs"
        description="Acesse diretamente as contas de cada IA, gerencie credenciais, adicione créditos e monitore o status da infraestrutura em tempo real."
      />

      {/* Antecedência da produção automática das pautas agendadas */}
      <ProductionSettings />

      {/* Central de Acesso Rápido a todos os Portais de APIs */}
      <ApiQuickLinks />

      {/* Quotas e Webhooks por organização */}
      <div className="grid gap-4 lg:grid-cols-2">
        <QuotasEditor />
        <WebhooksManager />
      </div>

      {/* Sala de Controle das APIs com Latência e Testes em Tempo Real */}
      <ApiControlRoom />

      {/* Visão de Variáveis de Ambiente com Atalhos */}
      <div className="space-y-6 pt-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">Diagnóstico de Variáveis do Servidor</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verifique quais chaves estão ativas e acesse diretamente os painéis de gerenciamento de cada serviço.
          </p>
        </div>

        {envCheck.map((group) => {
          const Icon = group.icon;
          return (
            <Card key={group.category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  {group.category}
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {group.items.map((item) => (
                  <div
                    key={item.name}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-2"
                  >
                    <div>
                      <span className="font-mono text-xs font-semibold text-foreground block">
                        {item.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.portalUrl && (
                        <a
                          href={item.portalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {item.portalLabel}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      )}
                      {item.isSet ? (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Configurado
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Não Configurado
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Diretrizes de Segurança */}
      <Card className="border-amber-200/70 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="text-base text-amber-900 dark:text-amber-300 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            Políticas de Segurança e Faturamento
          </CardTitle>
          <CardDescription className="text-amber-700/90 dark:text-amber-400">
            Todas as chaves de API estão protegidas no ambiente seguro da Vercel. Utilize os atalhos diretos acima para gerenciar seus cartões, consultar saldos pré-pagos e emitir novas credenciais em cada plataforma sempre que necessário.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
