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
    <Card className="border-border shadow-card overflow-hidden">
      <CardHeader className="gradient-hero border-b border-[hsl(var(--sidebar-border))] text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-brand-btn gradient-primary text-white shadow-glow">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2 text-white">
                Autopilot Settings
                <Badge variant={enabled ? "success" : "default"}>
                  {enabled ? "Ativo" : "Desativado"}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-white/70">
                Configure a esteira autônoma de publicação individual para este blog.
              </CardDescription>
            </div>
          </div>
          <Sparkles className="h-5 w-5 text-[hsl(var(--color-cyan))] opacity-90" />
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {state?.error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/25 bg-[hsl(var(--danger-bg))] p-3.5 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{state.error}</span>
          </div>
        )}

        {state?.success && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-success/25 bg-[hsl(var(--success-bg))] p-3.5 text-xs text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" />
            <span>Configurações do Autopilot atualizadas com sucesso!</span>
          </div>
        )}

        <form action={formAction} className="space-y-4">
          {/* Toggle Ativar Autopilot */}
          <div className="flex items-center justify-between rounded-brand-card border border-border p-3.5 bg-[hsl(var(--bg-subtle))]">
            <div className="space-y-0.5">
              <label htmlFor="autopilot_enabled" className="text-sm font-semibold text-foreground cursor-pointer">
                Habilitar Piloto Automático
              </label>
              <p className="text-xs text-muted-foreground">
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
              className="h-5 w-5 rounded border-input text-primary focus:ring-ring cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {/* Horário Inicial */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
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
              <span className="text-[11px] text-[hsl(var(--text-muted))] block">
                Nenhum artigo sai antes deste horário.
              </span>
            </div>

            {/* Intervalo em Minutos */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-primary" />
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
              <span className="text-[11px] text-[hsl(var(--text-muted))] block">
                Espera mínima entre publicações sucessivas.
              </span>
            </div>

            {/* Limite Diário */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <ListOrdered className="h-3.5 w-3.5 text-primary" />
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
              <span className="text-[11px] text-[hsl(var(--text-muted))] block">
                Máximo de posts automáticos por dia.
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <Button type="submit" disabled={isPending} className="font-medium">
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
