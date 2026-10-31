"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Globe, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface WordPressCredentialsCardProps {
  blogId: string;
  domain: string | null;
  siteUrl: string;
  username: string;
  configured: boolean;
}

// Login do WordPress deste blog. A senha vai para o Vault do Supabase, só para
// este blog, e é testada no WordPress antes de ser salva.
export function WordPressCredentialsCard({ blogId, domain, siteUrl, username, configured }: WordPressCredentialsCardProps) {
  const router = useRouter();
  const [form, setForm] = useState({ siteUrl: siteUrl || (domain ? `https://${domain}` : ""), username, password: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/blogs/${blogId}/wordpress-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: form.siteUrl.trim().replace(/\/+$/, ""),
          wpUsername: form.username.trim(),
          wpApplicationPassword: form.password.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Falha ao salvar o login do WordPress.");
      setForm((prev) => ({ ...prev, password: "" }));
      setFeedback({ type: "success", message: "Login testado no WordPress e salvo para este blog." });
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Falha ao salvar o login do WordPress." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          WordPress
          <Badge variant={configured ? "success" : "default"}>{configured ? "Configurado" : "Sem senha"}</Badge>
        </CardTitle>
        <CardDescription>
          Login usado para publicar neste blog. Cada blog tem o seu; sem ele, os posts deste blog não são publicados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {feedback && (
          <div
            className={`mb-4 flex items-start gap-2 rounded-lg border p-3.5 text-xs ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
            }`}
          >
            {feedback.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
            <span>{feedback.message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">URL do WordPress</label>
            <Input
              value={form.siteUrl}
              onChange={(e) => setForm({ ...form, siteUrl: e.target.value })}
              placeholder={`Ex: https://${domain ?? "meublog.com.br"}`}
              disabled={isSaving}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Usuário WordPress</label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Ex: admin ou editor_ai"
                disabled={isSaving}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Senha de Aplicativo</label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={configured ? "•••••••••••• (preencha só para trocar)" : "Ex: abcd efgh ijkl mnop qrst uvwx"}
                disabled={isSaving}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Crie a senha no WordPress em Usuários → Perfil → Senhas de aplicativo. Ela tem 24 letras em grupos de 4 e é diferente da senha de login.
          </p>
          <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testando e salvando...
                </>
              ) : (
                "Salvar login do WordPress"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
