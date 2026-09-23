"use client";

import * as React from "react";
import { useActionState, useState } from "react";
import {
  Bot,
  Clock,
  Timer,
  ListOrdered,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { updateAutopilotConfigAction, ActionResult } from "@/app/actions/blog";
import { BlogWithRelations, AutopilotConfig } from "@/types/blog";

interface AutopilotSettingsCardProps {
  blog: BlogWithRelations;
}

const initialState: ActionResult = {};

export function AutopilotSettingsCard({ blog }: AutopilotSettingsCardProps) {
  const updateWithId = updateAutopilotConfigAction.bind(null, blog.id);
  const [state, formAction, isPending] = useActionState(updateWithId, initialState);

  // Extrai configurações atuais do blog ou do JSON editorial_config
  const edConfig = (blog.editorial_config as { autopilot?: AutopilotConfig })?.autopilot ||
    (blog.editorial_config as AutopilotConfig) || {};

  const initialEnabled = blog.autopilot_enabled ?? edConfig.autopilot_enabled ?? false;
  const initialStartTime = blog.autopilot_start_time || edConfig.autopilot_start_time || "06:00";
  const initialInterval = Number(
    blog.autopilot_interval_minutes || edConfig.autopilot_interval_minutes || 30
  );
  const initialDailyLimit = Number(
    blog.autopilot_daily_limit || edConfig.autopilot_daily_limit || 5
  );

  const [enabled, setEnabled] = useState<boolean>(Boolean(initialEnabled));

  return (
    <Card className="border-blue-200/60 dark:border-blue-900/40 shadow-sm overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-blue-50/50 via-slate-50 to-white dark:from-blue-950/20 dark:via-slate-900/40 dark:to-slate-900 border-b border-blue-100 dark:border-blue-900/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600 text-white shadow-sm">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Autopilot Settings
                <Badge variant={enabled ? "success" : "default"}>
                  {enabled ? "Ativo" : "Desativado"}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Configure a esteira autônoma de publicação individual para este blog.
              </CardDescription>
            </div>
          </div>
          <Sparkles className="h-5 w-5 text-blue-400 opacity-60" />
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {state?.error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{state.error}</span>
          </div>
        )}

        {state?.success && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>Configurações do Autopilot atualizadas com sucesso!</span>
          </div>
        )}

        <form action={formAction} className="space-y-4">
          {/* Toggle Ativar Autopilot */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="space-y-0.5">
              <label htmlFor="autopilot_enabled" className="text-sm font-semibold text-slate-900 dark:text-slate-100 cursor-pointer">
                Habilitar Piloto Automático
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Quando ativado, o worker checa a cada minuto e publica pautas agendadas automaticamente.
              </p>
            </div>
            <input
              type="checkbox"
              id="autopilot_enabled"
              name="autopilot_enabled"
              value="true"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={isPending}
              className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {/* Horário Inicial */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-blue-500" />
                Horário Inicial (HH:mm)
              </label>
              <Input
                type="time"
                name="autopilot_start_time"
                defaultValue={initialStartTime}
                required
                disabled={isPending}
                className="font-mono text-sm"
              />
              <span className="text-[11px] text-slate-400 block">
                Nenhum artigo sai antes deste horário.
              </span>
            </div>

            {/* Intervalo em Minutos */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-blue-500" />
                Intervalo Mínimo (minutos)
              </label>
              <Input
                type="number"
                name="autopilot_interval_minutes"
                defaultValue={initialInterval}
                min={1}
                max={1440}
                required
                disabled={isPending}
                className="font-mono text-sm"
              />
              <span className="text-[11px] text-slate-400 block">
                Espera mínima entre publicações sucessivas.
              </span>
            </div>

            {/* Limite Diário */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ListOrdered className="h-3.5 w-3.5 text-blue-500" />
                Limite Diário de Artigos
              </label>
              <Input
                type="number"
                name="autopilot_daily_limit"
                defaultValue={initialDailyLimit}
                min={1}
                max={50}
                required
                disabled={isPending}
                className="font-mono text-sm"
              />
              <span className="text-[11px] text-slate-400 block">
                Máximo de posts automáticos por dia.
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando Autopilot...
                </>
              ) : (
                "Salvar Configurações do Autopilot"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
