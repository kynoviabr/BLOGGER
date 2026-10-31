"use client";

import * as React from "react";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Globe, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Credenciais WordPress exclusivas deste blog. Salva via /api/blogs/[id]/wordpress-credentials,
// que testa a credencial no WordPress antes de gravar a senha no Vault (nunca no JSON do blog).

interface WordPressSettingsCardProps {
  blogId: string;
  domain: string;
  initialSiteUrl: string;
  initialUsername: string;
  configured: boolean;
  updatedAt: string | null;
}

export function WordPressSettingsCard({
  blogId,
  domain,
  initialSiteUrl,
  initialUsername,
  configured: initialConfigured,
  updatedAt: initialUpdatedAt,
}: WordPressSettingsCardProps) {
  const [siteUrl, setSiteUrl] = useState(initialSiteUrl || `https://${domain}`);
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [configured, setConfigured] = useState(initialConfigured);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsPending(true);
    try {
      const response = await fetch(`/api/blogs/${blogId}/wordpress-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl, wpUsername: username, wpApplicationPassword: password }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        credential?: { updated_at?: string } | null;
      };
      if (!response.ok || !json.success) {
        setError(json.error || `Falha ao salvar (${response.status}).`);
        return;
      }
      setPassword("");
      setConfigured(true);
      setUpdatedAt(json.credential?.updated_at ?? new Date().toISOString());
      setSuccess("Credencial testada no WordPress e salva para este blog.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar credencial WordPress.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Integração WordPress (Publicação Direta)
          <Badge variant={configured ? "success" : "default"}>
            {configured ? "Configurado" : "Não configurado"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Credenciais da REST API exclusivas deste blog. A publicação usa somente a senha salva aqui;
          sem ela, os posts deste blog não são publicados.
          {configured && updatedAt && (
            <> Última atualização: {new Date(updatedAt).toLocaleString("pt-BR")}.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              URL do WordPress
            </label>
            <Input
              name="wp_site_url"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder={`Ex: https://${domain}`}
              required
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Usuário WordPress (REST API)
              </label>
              <Input
                name="wp_username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: admin ou editor_ai"
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Senha de Aplicativo (Application Password)
              </label>
              <Input
                name="wp_application_password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={configured ? "•••••••••••• (digite para trocar)" : "Ex: abcd efgh ijkl mnop qrst uvwx"}
                required
                minLength={8}
                disabled={isPending}
                autoComplete="new-password"
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Gere a senha em WordPress → Usuários → seu perfil → Senhas de aplicativo. Ela é testada no
            WordPress antes de ser salva.
          </p>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testando e salvando...
                </>
              ) : (
                "Salvar credencial WordPress"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
