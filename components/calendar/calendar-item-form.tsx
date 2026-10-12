"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { createCalendarItemAction, ActionResult } from "@/app/actions/calendar";
import { BlogWithRelations } from "@/types/blog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES } from "@/config/languages";

interface CalendarItemFormProps {
  blogs: BlogWithRelations[];
  defaultBlogId?: string;
}

const initialState: ActionResult = {};

export function CalendarItemForm({ blogs, defaultBlogId }: CalendarItemFormProps) {
  const [state, formAction, isPending] = useActionState(createCalendarItemAction, initialState);
  const [selectedBlogId, setSelectedBlogId] = React.useState<string>(
    defaultBlogId && blogs.some((b) => b.id === defaultBlogId)
      ? defaultBlogId
      : blogs[0]?.id || ""
  );
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string>("");

  const currentBlog = blogs.find((b) => b.id === selectedBlogId);
  const categoriesToDisplay = currentBlog?.categories || [];

  return (
    <div>
      {state?.error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Blog de Destino *
            </label>
            <Select
              name="blog_id"
              value={selectedBlogId}
              onChange={(e) => {
                setSelectedBlogId(e.target.value);
                setSelectedCategoryId("");
              }}
              required
              disabled={isPending}
            >
              {blogs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Categoria
            </label>
            <Select
              name="category_id"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              disabled={isPending}
            >
              <option value="">Nenhuma / Geral</option>
              {categoriesToDisplay.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Idioma *
            </label>
            <Select name="language" defaultValue="pt-BR" disabled={isPending}>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Tema / Assunto do Artigo *
          </label>
          <Input
            name="topic"
            placeholder="Ex: Como Escolher o Melhor Cartão Sem Anuidade em 2026"
            required
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Título Proposto (SEO H1) *
          </label>
          <Input
            name="proposed_title"
            placeholder="Ex: Guia Completo dos Melhores Cartões de Crédito Sem Anuidade"
            required
            disabled={isPending}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Palavras-chave (separadas por vírgula)
            </label>
            <Input
              name="keywords"
              placeholder="cartao sem anuidade, cashback, milhas, score de credito"
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Tipo de Artigo
            </label>
            <Select name="article_type" defaultValue="standard" disabled={isPending}>
              <option value="standard">Artigo Padrão (1.200 a 1.500 palavras)</option>
              <option value="listicle">Lista / Ranking (Top Melhores)</option>
              <option value="how-to">Passo a Passo / Tutorial</option>
              <option value="review">Análise Detalhada / Review</option>
              <option value="pillar">Pilar / Guia Definitivo (+2.000 palavras)</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Data e Hora Programada de Publicação
            </label>
            <Input
              type="datetime-local"
              name="scheduled_at"
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Prioridade
            </label>
            <Select name="priority" defaultValue="medium" disabled={isPending}>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta (Fura-fila)</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Status Inicial
            </label>
            <Select name="status" defaultValue="PLANNED" disabled={isPending}>
              <option value="IDEA">Ideia (Banco de Ideias)</option>
              <option value="PLANNED">Planejado (Pronto para Automação)</option>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Observações / Diretrizes Específicas
          </label>
          <Textarea
            name="notes"
            rows={3}
            placeholder="Orientações específicas para o LLM sobre tom, concorrentes a citar ou fontes..."
            disabled={isPending}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Link href="/calendar">
            <Button type="button" variant="outline" disabled={isPending}>
              Cancelar
            </Button>
          </Link>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cadastrando Pauta...
              </>
            ) : (
              "Salvar Pauta no Calendário"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
