import { CheckCircle2, XCircle, Key, Server, Cpu, UploadCloud, ShieldAlert, FileCode } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
          description: "Chave de acesso à API do Google Gemini (Fase 02)",
          isSet: !!process.env.GEMINI_API_KEY,
        },
        {
          name: "IMAGE_API_KEY",
          description: "Chave do provedor de geração de imagens (Fase 02)",
          isSet: !!process.env.IMAGE_API_KEY,
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
          name: "PUBLISHER_TYPE",
          description: "Driver de publicação ativo (mock, wordpress, api)",
          isSet: !!process.env.PUBLISHER_TYPE,
        },
      ],
    },
  ];

  return (
    <div className="space-y-8 max-w-4xl">
      <PageHeader
        title="Configurações & Ambiente"
        description="Diagnóstico da infraestrutura, status das variáveis de ambiente e diretrizes de evolução da Content Factory."
      />

      {/* Visão de Variáveis de Ambiente */}
      <div className="space-y-6">
        {envCheck.map((group) => {
          const Icon = group.icon;
          return (
            <Card key={group.category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-4 w-4 text-blue-600" />
                  {group.category}
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.items.map((item) => (
                  <div
                    key={item.name}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-2"
                  >
                    <div>
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white block">
                        {item.name}
                      </span>
                      <span className="text-xs text-slate-500">{item.description}</span>
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
                          Não Definido (Mock Ativo)
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
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Políticas de Segurança da Foundation
          </CardTitle>
          <CardDescription className="text-amber-700/90 dark:text-amber-400">
            Nenhuma API Key ou credencial sensível é armazenada no banco de dados PostgreSQL. Todas as credenciais de provedores externos devem ser injetadas exclusivamente através de variáveis de ambiente na Vercel ou no arquivo <code>.env.local</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
