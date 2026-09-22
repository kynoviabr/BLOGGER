"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, Loader2, Sparkles, ExternalLink, ShieldCheck, Image as ImageIcon } from "lucide-react";
import { updateContentAction, ActionResult } from "@/app/actions/content";
import { ContentItemWithRelations } from "@/types/content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

interface ContentEditFormProps {
  content: ContentItemWithRelations;
}

const initialState: ActionResult = {};

export function ContentEditForm({ content }: ContentEditFormProps) {
  const updateWithId = updateContentAction.bind(null, content.id);
  const [state, formAction, isPending] = useActionState(updateWithId, initialState);

  return (
    <div>
      {state?.error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Coluna Principal: Editor de Conteúdo (2 colunas) */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Corpo do Artigo</CardTitle>
                <CardDescription>
                  Edite o conteúdo em texto estruturado / Markdown.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Título Principal
                  </label>
                  <Input name="title" defaultValue={content.title} required disabled={isPending} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Slug da URL
                  </label>
                  <Input name="slug" defaultValue={content.slug} required disabled={isPending} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Resumo / Excerpt
                  </label>
                  <Textarea
                    name="excerpt"
                    defaultValue={content.excerpt || ""}
                    rows={2}
                    placeholder="Breve resumo introdutório do artigo..."
                    disabled={isPending}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Corpo do Artigo (Markdown / Texto)
                  </label>
                  <Textarea
                    name="body"
                    defaultValue={content.body}
                    rows={14}
                    className="font-mono text-xs leading-relaxed"
                    disabled={isPending}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Metadados de SEO */}
            <Card>
              <CardHeader>
                <CardTitle>Otimização SEO (Search Engine Optimization)</CardTitle>
                <CardDescription>
                  Campos essenciais para indexação e mecanismos de resposta com IA.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Título SEO (Tag Title)
                  </label>
                  <Input
                    name="seo_title"
                    defaultValue={content.seo_title || ""}
                    placeholder="Título otimizado para SERPs..."
                    disabled={isPending}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Meta Description
                  </label>
                  <Textarea
                    name="meta_description"
                    defaultValue={content.meta_description || ""}
                    rows={2}
                    placeholder="Descrição para snippets do Google..."
                    disabled={isPending}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coluna Lateral: Status, Mídia, Fontes e AI Runs (1 coluna) */}
          <div className="space-y-6">
            {/* Status & Publicação */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ciclo Editorial</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">
                    Status Atual
                  </label>
                  <Select name="status" defaultValue={content.status} disabled={isPending}>
                    <option value="draft">Rascunho (Draft)</option>
                    <option value="reviewing">Em Revisão</option>
                    <option value="ready">Pronto para Publicar</option>
                    <option value="scheduled">Agendado</option>
                    <option value="published">Publicado</option>
                    <option value="archived">Arquivado</option>
                  </Select>
                </div>

                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40 text-xs space-y-1 text-slate-500">
                  <div>Criado em: {formatDate(content.created_at)}</div>
                  {content.published_at && (
                    <div>Publicado em: {formatDate(content.published_at)}</div>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando Artigo...
                    </>
                  ) : (
                    "Salvar Artigo"
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Imagem de Destaque */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-amber-600" />
                  Imagem de Destaque
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {content.featured_image ? (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={content.featured_image.public_url}
                      alt={content.featured_image.alt_text || "Imagem destacada"}
                      className="w-full h-36 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                    />
                    <p className="text-[11px] text-slate-500 line-clamp-2">
                      {content.featured_image.alt_text}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
                    Nenhuma imagem associada
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Runs Executadas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  Histórico de IA (AI Runs)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {content.ai_runs && content.ai_runs.length > 0 ? (
                  content.ai_runs.map((run) => (
                    <div
                      key={run.id}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40 text-xs space-y-1"
                    >
                      <div className="flex justify-between font-medium text-slate-800 dark:text-slate-200">
                        <span>{run.agent}</span>
                        <span className="text-emerald-600">{run.model}</span>
                      </div>
                      <p className="text-slate-500 text-[11px]">{run.output_summary}</p>
                      <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                        <span>Duração: {run.duration_ms}ms</span>
                        <span>Custo: ${Number(run.estimated_cost).toFixed(6)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">Nenhuma execução de IA registrada.</p>
                )}
              </CardContent>
            </Card>

            {/* Fontes de Pesquisa */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  Fontes Citadas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {content.sources && content.sources.length > 0 ? (
                  content.sources.map((src) => (
                    <a
                      key={src.id}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-700 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300"
                    >
                      <span className="truncate max-w-[200px]">{src.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">Nenhuma fonte cadastrada.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
