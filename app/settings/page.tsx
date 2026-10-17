import { CheckCircle2, XCircle, Server, Cpu, UploadCloud, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiControlRoom } from "@/components/settings/api-control-room";

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
        },
        {
          name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          description: "Chave pública anônima do Supabase",
          isSet: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        },
        {
          name: "SUPABASE_SERVICE_ROLE_KEY",
          description: "Chave privada de serviço (admin bypass para workers)",
          isSet: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
      ],
    },
    {
      category: "Pipeline de Inteligência Artificial",
      icon: Cpu,
      items: [
        {
          name: "GEMINI_API_KEY",
          description: "Chave de acesso à API do Google Gemini (Texto & Ideação)",
          isSet: !!process.env.GEMINI_API_KEY,
        },
        {
          name: "TOGETHER_API_KEY",
          description: "Chave da Together AI para FLUX e Nano Banana (Imagens)",
          isSet: !!process.env.TOGETHER_API_KEY,
        },
        {
          name: "DEEPSEEK_API_KEY",
          description: "Chave do DeepSeek V3 para redação editorial profunda",
          isSet: !!process.env.DEEPSEEK_API_KEY,
        },
        {
          name: "OPENAI_API_KEY",
          description: "Chave da OpenAI para DALL-E / gpt-image-1-mini",
          isSet: !!process.env.OPENAI_API_KEY,
        },
      ],
    },
    {
      category: "Segurança & Publicação",
      icon: UploadCloud,
      items: [
        {
          name: "CRON_SECRET",
          description: "Token bearer para acionamento de workers via Vercel Cron",
          isSet: !!process.env.CRON_SECRET,
        },
        {
          name: "WORDPRESS_SITE_URL",
          description: "URL base do blog WordPress de destino",
          isSet: !!process.env.WORDPRESS_SITE_URL,
        },
        {
          name: "WORDPRESS_APPLICATION_PASSWORD",
          description: "Senha de aplicativo REST API para publicação",
          isSet: !!process.env.WORDPRESS_APPLICATION_PASSWORD,
        },
      ],
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl">
      <PageHeader
        title="Configurações & Sala de Controle"
        description="Gerenciamento de conexões de IA, links diretos de faturamento, saldo de créditos e diagnóstico da infraestrutura."
      />

      {/* Sala de Controle das APIs em Tempo Real */}
      <ApiControlRoom />

      {/* Visão de Variáveis de Ambiente */}
      <div className="space-y-6 pt-4">
        <h3 className="text-base font-semibold text-foreground">Diagnóstico de Ambiente do Servidor</h3>
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
                    <div>
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
            Todas as chaves de API devem ser configuradas exclusivamente nas variáveis de ambiente da Vercel ou no arquivo <code>.env.local</code>. Utilize os atalhos de cada provedor acima para gerenciar seus cartões e saldos pré-pagos sem depender de depósitos mínimos obrigatórios.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
