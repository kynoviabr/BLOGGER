"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, Loader2, Globe } from "lucide-react";
import { updateBlogAction, ActionResult } from "@/app/actions/blog";
import { BlogWithRelations, WordPressConfig } from "@/types/blog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES } from "@/config/languages";

interface BlogEditFormProps {
  blog: BlogWithRelations;
  wordpressPasswordConfigured: boolean;
}

const initialState: ActionResult = {};

export function BlogEditForm({ blog, wordpressPasswordConfigured }: BlogEditFormProps) {
  const updateWithId = updateBlogAction.bind(null, blog.id);
  const [state, formAction, isPending] = useActionState(updateWithId, initialState);

  const edConfig = (blog.editorial_config as Record<string, unknown>) || {};
  const wpConfig = (edConfig.wordpress as WordPressConfig) || {};

  return (
    <div>
      {state?.error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Nome do Blog
          </label>
          <Input name="name" defaultValue={blog.name} required disabled={isPending} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Domínio
            </label>
            <Input name="domain" defaultValue={blog.domain} required disabled={isPending} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Status
            </label>
            <Select name="status" defaultValue={blog.status} disabled={isPending}>
              <option value="active">Ativo (Produzindo)</option>
              <option value="inactive">Inativo (Pausado)</option>
              <option value="archived">Arquivado</option>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Idioma Padrão do Blog
          </label>
          <Select name="default_language" defaultValue={blog.default_language || "pt-BR"} disabled={isPending}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.name} ({lang.code})
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Nicho
            </label>
            <Input name="niche" defaultValue={blog.niche} required disabled={isPending} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Audiência
            </label>
            <Input name="audience" defaultValue={blog.audience || ""} disabled={isPending} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Descrição
          </label>
          <Textarea
            name="description"
            defaultValue={blog.description || ""}
            rows={3}
            disabled={isPending}
          />
        </div>

        {/* Seção de Credenciais WordPress */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Integração WordPress (Publicação Direta)
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Credenciais da REST API exclusivas deste blog. Se não preenchidas, o sistema usa as variáveis padrão globais (.env).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Usuário WordPress (REST API)
              </label>
              <Input
                name="wp_username"
                defaultValue={wpConfig.wp_username || ""}
                placeholder="Ex: admin ou editor_ai"
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
                placeholder={wordpressPasswordConfigured ? "•••••••••••• (deixe em branco p/ manter)" : "Ex: abcd efgh ijkl mnop"}
                disabled={isPending}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              URL do WordPress (Opcional)
            </label>
            <Input
              name="wp_site_url"
              defaultValue={wpConfig.wp_site_url || ""}
              placeholder={`Ex: https://${blog.domain}`}
              disabled={isPending}
            />
            <p className="text-[11px] text-muted-foreground">
              Deixe em branco para usar automaticamente https://{blog.domain}.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Alterações"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
