"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Tag } from "lucide-react";
import { updateCalendarItemAction, ActionResult } from "@/app/actions/calendar";
import { CalendarItemWithRelations } from "@/types/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

interface CalendarItemEditFormProps {
  item: CalendarItemWithRelations;
}

const initialState: ActionResult = {};

export function CalendarItemEditForm({ item }: CalendarItemEditFormProps) {
  const updateWithId = updateCalendarItemAction.bind(null, item.id);
  const [state, formAction, isPending] = useActionState(updateWithId, initialState);

  const formattedDate = item.scheduled_at
    ? new Date(item.scheduled_at).toISOString().slice(0, 16)
    : "";

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
            Tema / Assunto Principal
          </label>
          <Input name="topic" defaultValue={item.topic} required disabled={isPending} />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Título Proposto
          </label>
          <Input name="proposed_title" defaultValue={item.proposed_title} required disabled={isPending} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Status
            </label>
            <Select name="status" defaultValue={item.status} disabled={isPending}>
              <option value="IDEA">IDEA</option>
              <option value="PLANNED">PLANNED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="READY">READY</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="FAILED">FAILED</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Prioridade
            </label>
            <Select name="priority" defaultValue={item.priority} disabled={isPending}>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Data e Hora Agendada
            </label>
            <Input type="datetime-local" name="scheduled_at" defaultValue={formattedDate} disabled={isPending} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Palavras-chave Atuais
          </label>
          <div className="flex flex-wrap gap-1.5 py-1">
            {item.keywords && item.keywords.length > 0 ? (
              item.keywords.map((kw, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <Tag className="h-3 w-3 text-slate-400" />
                  {kw}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">Nenhuma palavra-chave informada</span>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Observações Editoriais
          </label>
          <Textarea name="notes" defaultValue={item.notes || ""} rows={3} disabled={isPending} />
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
