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
}

const initialState: ActionResult = {};

export function CalendarItemForm({ blogs }: CalendarItemFormProps) {
  const [state, formAction, isPending] = useActionState(createCalendarItemAction, initialState);
  const allCategories = blogs.flatMap((b) => b.categories || []);

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
            <Select name="blog_id" required disabled={isPending}>
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
            <Select name="category_id" disabled={isPending}>
              <option value="">Nenhuma / Geral</option>
              {allCategories.map((c) => (
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
            Tema / Assunto Principal *
          </label>
          <Input
            name="topic"
            placeholder="Ex: Como criar agentes autônomos com LLMs locais em 2026"
            required
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Título Proposto
          </label>
          <Input
            name="proposed_title"
            placeholder="Ex: Guia Completo: Construindo Agentes Autônomos em 2026"
            disabled={isPending}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Palavras-Chave (separadas por vírgula)
            </label>
            <Input
              name="keywords"
              placeholder="ia, agentes inteligentes, llm, automacao"
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Tipo de Artigo
            </label>
            <Select name="article_type" defaultValue="standard" disabled={isPending}>
              <option value="standard">Padrão / Notícia</option>
              <option value="deep_dive">Artigo Aprofundado (Deep Dive)</option>
              <option value="tutorial">Tutorial Prático (Passo a Passo)</option>
              <option value="listicle">Lista / Comparativo (Top 10)</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Data e Hora Agendada
            </label>
            <Input type="datetime-local" name="scheduled_at" disabled={isPending} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Prioridade
            </label>
            <Select name="priority" defaultValue="medium" disabled={isPending}>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Status Inicial
            </label>
            <Select name="status" defaultValue="PLANNED" disabled={isPending}>
              <option value="IDEA">IDEA (Ideia)</option>
              <option value="PLANNED">PLANNED (Planejada)</option>
              <option value="IN_PROGRESS">IN_PROGRESS (Em Produção)</option>
              <option value="READY">READY (Pronta para Revisão)</option>
              <option value="SCHEDULED">SCHEDULED (Agendada)</option>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Notas / Instruções Específicas
          </label>
          <Textarea
            name="notes"
            placeholder="Ex: Citar benchmarks atualizados, incluir diagrama conceitual, focar em casos reais..."
            rows={3}
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
                Cadastrando...
              </>
            ) : (
              "Cadastrar Pauta no Calendário"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
