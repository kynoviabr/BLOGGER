"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Loader2, Globe } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES } from "@/config/languages";
import { createBlogAction, ActionResult } from "@/app/actions/blog";

const initialState: ActionResult = {};

export default function NewBlogPage() {
  const [state, formAction, isPending] = useActionState(createBlogAction, initialState);

  const [formData, setFormData] = React.useState({
    name: "",
    slug: "",
    domain: "",
    default_language: "pt-BR",
    niche: "",
    audience: "",
    description: "",
    wp_username: "",
    wp_application_password: "",
    wp_site_url: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/blogs"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para Blogs
      </Link>

      <PageHeader
        title="Cadastrar Novo Blog"
        description="Adicione um novo blog à Content Factory. Cada blog terá seu próprio calendário editorial e configurações de automação."
      />

      <Card>
        <CardHeader>
          <CardTitle>Informações do Blog</CardTitle>
          <CardDescription>
            Defina os dados principais que guiarão a geração de conteúdo e o tom de voz da IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state?.error && (
            <div className="mb-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          <form action={formAction} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Nome do Blog *
                </label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ex: AI & Robotics Daily"
                  required
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Slug (URL amigável)
                </label>
                <Input
                  name="slug"
                  value={formData.slug}
                  onChange={handleChange}
                  placeholder="ai-robotics-daily (opcional)"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Domínio Oficial *
                </label>
                <Input
                  name="domain"
                  value={formData.domain}
                  onChange={handleChange}
                  placeholder="exemplo.com"
                  required
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Idioma Padrão *
                </label>
                <Select
                  name="default_language"
                  value={formData.default_language}
                  onChange={handleChange}
                  disabled={isPending}
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name} ({lang.code})
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Nicho de Atuação *
                </label>
                <Input
                  name="niche"
                  value={formData.niche}
                  onChange={handleChange}
                  placeholder="Ex: Tecnologia, Finanças, Saúde"
                  required
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Público-Alvo
                </label>
                <Input
                  name="audience"
                  value={formData.audience}
                  onChange={handleChange}
                  placeholder="Ex: Desenvolvedores, Founders, Estudantes"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Descrição e Propósito Editorial
              </label>
              <Textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Descreva o propósito deste blog, principais temáticas e posicionamento editorial desejado..."
                rows={3}
                disabled={isPending}
              />
            </div>

            {/* Integração WordPress */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  Integração WordPress (Publicação Direta - Opcional)
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Informe credenciais REST API deste WordPress para publicar artigos nele. Se deixar em branco, o sistema utilizará as variáveis padrão globais (.env).
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Usuário WordPress (REST API)
                  </label>
                  <Input
                    name="wp_username"
                    value={formData.wp_username}
                    onChange={handleChange}
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
                    value={formData.wp_application_password}
                    onChange={handleChange}
                    placeholder="Ex: abcd efgh ijkl mnop"
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
                  value={formData.wp_site_url}
                  onChange={handleChange}
                  placeholder="Ex: https://meublog.com (em branco usa https://{dominio})"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Link href="/blogs">
                <Button type="button" variant="outline" disabled={isPending}>
                  Cancelar
                </Button>
              </Link>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar e Criar Blog"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
