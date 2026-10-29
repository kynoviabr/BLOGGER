"use client";

import * as React from "react";
import { useState } from "react";
import {
  Share2,
  Facebook,
  Instagram,
  Linkedin,
  ShieldCheck,
  Info,
  KeyRound,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BlogWithRelations } from "@/types/blog";

// Tela de configuração da publicação automática em redes sociais.
// Somente front-end por enquanto: os valores ficam no estado local e o botão
// de salvar fica desabilitado até a action/tabela do backend existir.

type NetworkId = "facebook" | "instagram" | "linkedin";

interface NetworkField {
  name: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  help?: string;
}

interface NetworkDefinition {
  id: NetworkId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  description: string;
  fields: NetworkField[];
  note?: string;
  docsUrl: string;
}

const NETWORKS: NetworkDefinition[] = [
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    iconClass: "text-[#1877F2]",
    description: "Publica um post com link na Página do Facebook a cada artigo novo.",
    fields: [
      {
        name: "facebook_page_id",
        label: "ID da Página",
        placeholder: "Ex: 104857392018475",
        help: "Fica em Página > Sobre > Transparência da Página.",
      },
      {
        name: "facebook_app_id",
        label: "App ID (Meta for Developers)",
        placeholder: "Ex: 812345678901234",
      },
      {
        name: "facebook_page_access_token",
        label: "Token de Acesso da Página",
        placeholder: "EAAG...",
        secret: true,
        help: "Use um token de longa duração com permissão pages_manage_posts.",
      },
    ],
    docsUrl: "https://developers.facebook.com/docs/pages-api/posts",
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    iconClass: "text-[#E4405F]",
    description: "Publica a imagem de destaque com legenda no perfil do Instagram.",
    fields: [
      {
        name: "instagram_business_account_id",
        label: "ID da Conta Profissional do Instagram",
        placeholder: "Ex: 17841400000000000",
      },
      {
        name: "instagram_facebook_page_id",
        label: "ID da Página do Facebook vinculada",
        placeholder: "Ex: 104857392018475",
      },
      {
        name: "instagram_access_token",
        label: "Token de Acesso (Graph API)",
        placeholder: "EAAG...",
        secret: true,
        help: "Precisa da permissão instagram_content_publish.",
      },
    ],
    note:
      "O Instagram só aceita publicação automática em contas Profissionais (Empresa ou Criador) ligadas a uma Página do Facebook. Todo post precisa de imagem, e links na legenda não são clicáveis.",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    iconClass: "text-[#0A66C2]",
    description: "Compartilha o artigo na página da empresa ou no perfil pessoal.",
    fields: [
      {
        name: "linkedin_client_id",
        label: "Client ID do App",
        placeholder: "Ex: 78abcd1234efgh",
      },
      {
        name: "linkedin_author_id",
        label: "ID da Organização ou da Pessoa",
        placeholder: "Ex: 12345678",
        help: "Para página de empresa, é o número no fim da URL de administração.",
      },
      {
        name: "linkedin_access_token",
        label: "Token de Acesso (OAuth 2.0)",
        placeholder: "AQV...",
        secret: true,
        help: "Precisa da permissão w_organization_social (empresa) ou w_member_social (pessoa).",
      },
    ],
    docsUrl: "https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api",
  },
];

interface SocialPublishingCardProps {
  blog: BlogWithRelations;
}

export function SocialPublishingCard({ blog }: SocialPublishingCardProps) {
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [enabled, setEnabled] = useState<Record<NetworkId, boolean>>({
    facebook: false,
    instagram: false,
    linkedin: false,
  });

  const activeCount = masterEnabled
    ? Object.values(enabled).filter(Boolean).length
    : 0;

  return (
    <Card className="border-border shadow-card overflow-hidden">
      <CardHeader className="border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-brand-btn gradient-primary text-white shadow-glow">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Redes Sociais
                <Badge variant={activeCount > 0 ? "success" : "default"}>
                  {activeCount > 0 ? `${activeCount} ativa(s)` : "Desativado"}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Publique automaticamente cada artigo novo de {blog.name} no Facebook, Instagram e LinkedIn.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/10 p-3.5 text-xs text-info">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Prévia da tela. O salvamento e a publicação nas redes serão ligados na próxima etapa (backend).
          </span>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          {/* Liga/desliga geral para este blog */}
          <div className="flex items-center justify-between rounded-brand-card border border-border p-3.5 bg-[hsl(var(--bg-subtle))]">
            <div className="space-y-0.5">
              <label htmlFor="social_enabled" className="text-sm font-semibold text-foreground cursor-pointer">
                Publicar automaticamente nas redes sociais
              </label>
              <p className="text-xs text-muted-foreground">
                Opcional. Quando ligado, cada artigo publicado neste blog também vai para as redes ativadas abaixo.
              </p>
            </div>
            <input
              type="checkbox"
              id="social_enabled"
              name="social_enabled"
              value="true"
              checked={masterEnabled}
              onChange={(e) => setMasterEnabled(e.target.checked)}
              className="h-5 w-5 rounded border-input text-primary focus:ring-ring cursor-pointer"
            />
          </div>

          <fieldset disabled={!masterEnabled} className={masterEnabled ? "space-y-3" : "space-y-3 opacity-50"}>
            {NETWORKS.map((network) => {
              const Icon = network.icon;
              const isOn = masterEnabled && enabled[network.id];
              return (
                <div key={network.id} className="rounded-brand-card border border-border">
                  <div className="flex items-center justify-between gap-3 p-3.5">
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-5 w-5 ${network.iconClass}`} />
                      <div className="space-y-0.5">
                        <label
                          htmlFor={`${network.id}_enabled`}
                          className="text-sm font-semibold text-foreground cursor-pointer flex items-center gap-2"
                        >
                          {network.label}
                          {isOn && <Badge variant="success">Ativo</Badge>}
                        </label>
                        <p className="text-xs text-muted-foreground">{network.description}</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      id={`${network.id}_enabled`}
                      name={`${network.id}_enabled`}
                      value="true"
                      checked={enabled[network.id]}
                      onChange={(e) =>
                        setEnabled((prev) => ({ ...prev, [network.id]: e.target.checked }))
                      }
                      className="h-5 w-5 rounded border-input text-primary focus:ring-ring cursor-pointer"
                    />
                  </div>

                  {isOn && (
                    <div className="space-y-4 border-t border-border p-3.5 bg-[hsl(var(--bg-subtle))]">
                      {network.note && (
                        <p className="flex items-start gap-1.5 text-[11px] text-warning">
                          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{network.note}</span>
                        </p>
                      )}

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {network.fields.map((field) => (
                          <div
                            key={field.name}
                            className={field.secret ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}
                          >
                            <label
                              htmlFor={field.name}
                              className="text-xs font-medium text-foreground flex items-center gap-1.5"
                            >
                              {field.secret && <KeyRound className="h-3.5 w-3.5 text-primary" />}
                              {field.label}
                            </label>
                            <Input
                              id={field.name}
                              name={field.name}
                              type={field.secret ? "password" : "text"}
                              placeholder={field.placeholder}
                              autoComplete={field.secret ? "new-password" : "off"}
                              className={field.secret ? "font-mono text-sm" : "text-sm"}
                            />
                            {field.help && (
                              <span className="text-[11px] text-[hsl(var(--text-muted))] block">
                                {field.help}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`${network.id}_post_mode`}
                            className="text-xs font-medium text-foreground"
                          >
                            Quando publicar
                          </label>
                          <Select id={`${network.id}_post_mode`} name={`${network.id}_post_mode`} defaultValue="on_publish">
                            <option value="on_publish">Assim que o artigo for publicado</option>
                            <option value="review">Criar rascunho para eu revisar</option>
                          </Select>
                        </div>
                        <div className="flex items-end justify-between gap-3">
                          <a
                            href={network.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-primary hover:underline"
                          >
                            Como obter essas credenciais
                          </a>
                          <Button type="button" variant="outline" size="sm" disabled title="Disponível após o backend">
                            Testar conexão
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>

          <div className="flex items-start gap-2 rounded-lg border border-border p-3.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
            <span>
              Usamos tokens de API em vez de login e senha: as redes não permitem publicar por senha
              (bloqueiam ou pedem verificação em duas etapas), e o token pode ser revogado a qualquer
              momento sem trocar a senha da conta. Os tokens nunca serão exibidos de volta depois de salvos.
            </span>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <Button type="submit" disabled title="Disponível após o backend" className="font-medium">
              Salvar Redes Sociais (em breve)
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
