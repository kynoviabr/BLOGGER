"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
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
                <Input name="name" placeholder="Ex: AI & Robotics Daily" required disabled={isPending} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Slug (URL amigável)
                </label>
                <Input name="slug" placeholder="ai-robotics-daily (opcional)" disabled={isPending} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Domínio Oficial *
                </label>
                <Input name="domain" placeholder="exemplo.com" required disabled={isPending} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Idioma Padrão *
                </label>
                <Select name="default_language" defaultValue="pt-BR" disabled={isPending}>
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
                <Input name="niche" placeholder="Ex: Tecnologia, Finanças, Saúde" required disabled={isPending} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Público-Alvo
                </label>
                <Input name="audience" placeholder="Ex: Desenvolvedores, Founders, Estudantes" disabled={isPending} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Descrição e Propósito Editorial
              </label>
              <Textarea
                name="description"
                placeholder="Descreva o propósito deste blog, principais temáticas e posicionamento editorial desejado..."
                rows={3}
                disabled={isPending}
              />
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
