"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  autoScheduleApprovedAction,
  listApprovedUndatedAction,
  listBlogsForScheduleAction,
} from "@/app/actions/content";
import { buildAutoSchedulePlan, type WeekdayMode } from "@/lib/auto-schedule/plan";

export interface AutoScheduleItem {
  id: string;
  title: string;
  categoryId: string | null;
  categoryName: string;
}

interface AutoScheduleBoxProps {
  blogId: string; // blog selecionado no filtro da página (pode estar vazio)
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

const WEEKDAY_OPTIONS: { value: WeekdayMode; label: string }[] = [
  { value: "all", label: "Todos os dias" },
  { value: "workdays", label: "Dias úteis" },
  { value: "weekends", label: "Só fins de semana" },
];

export function AutoScheduleBox({ blogId: initialBlogId }: AutoScheduleBoxProps) {
  const router = useRouter();
  const [blogs, setBlogs] = useState<{ id: string; name: string }[]>([]);
  const [blogId, setBlogId] = useState<string>(initialBlogId);
  const [items, setItems] = useState<AutoScheduleItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    listBlogsForScheduleAction()
      .then(setBlogs)
      .catch(() => setBlogs([]));
  }, []);

  useEffect(() => {
    setBlogId(initialBlogId);
  }, [initialBlogId]);

  useEffect(() => {
    if (!blogId) {
      setItems([]);
      return;
    }
    let active = true;
    setLoadingItems(true);
    listApprovedUndatedAction(blogId)
      .then((rows) => active && setItems(rows))
      .catch(() => active && setItems([]))
      .finally(() => active && setLoadingItems(false));
    return () => {
      active = false;
    };
  }, [blogId]);

  const tomorrow = useMemo(() => addDays(new Date(), 1), []);
  const [startDate, setStartDate] = useState(isoDate(tomorrow));
  const [endDate, setEndDate] = useState(isoDate(addDays(tomorrow, 29)));
  const [weekdayMode, setWeekdayMode] = useState<WeekdayMode>("all");
  const [timesText, setTimesText] = useState("09:00, 15:00");

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const item of items) {
      if (!item.categoryId) continue;
      const current = map.get(item.categoryId) ?? { id: item.categoryId, name: item.categoryName, count: 0 };
      current.count++;
      map.set(item.categoryId, current);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [perDay, setPerDay] = useState<Record<string, number>>({});

  const times = useMemo(
    () =>
      timesText
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
        .map((t) => {
          const [h, m] = t.split(":");
          return `${h.padStart(2, "0")}:${m}`;
        }),
    [timesText]
  );

  const rules = categories
    .filter((c) => enabled[c.id] ?? true)
    .map((c) => ({ categoryId: c.id, perDay: Math.max(1, Math.min(perDay[c.id] ?? 1, 6)) }));

  const preview = useMemo(() => {
    if (!startDate || !endDate || rules.length === 0 || times.length === 0) return null;
    const candidates = items.filter((i) => i.categoryId).map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      categoryName: i.categoryName,
      title: i.title,
    }));
    return buildAutoSchedulePlan(candidates, { startDate, endDate, weekdayMode, rules, times });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, startDate, endDate, weekdayMode, timesText, JSON.stringify(rules)]);

  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const handleSchedule = async () => {
    if (!preview || preview.items.length === 0) return;
    if (!window.confirm(`Agendar ${preview.items.length} artigo(s) de ${startDate} a ${endDate}?`)) return;
    setIsWorking(true);
    setMessage(null);
    try {
      const result = await autoScheduleApprovedAction({ blogId, startDate, endDate, weekdayMode, rules, times });
      if (!result.success) {
        setMessage({ kind: "error", text: result.error ?? "Não foi possível agendar." });
      } else {
        const parts = [`${result.scheduled ?? 0} artigo(s) agendado(s).`];
        if (result.leftover) parts.push(`${result.leftover} ficaram sem vaga no período; agende outro intervalo para eles.`);
        if (result.skippedPastSlots) parts.push(`${result.skippedPastSlots} horário(s) já passaram e foram pulados.`);
        if (result.failed) parts.push(`${result.failed} falharam; veja o log.`);
        setMessage({ kind: "ok", text: parts.join(" ") });
        router.refresh();
      }
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Erro ao agendar." });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <CalendarClock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Publicação automática de aprovados</p>
            <p className="text-xs text-muted-foreground">
              {loadingItems ? "Carregando artigos aprovados..." : `${items.length} artigo(s) aprovados sem data.`} Escolha o período e quantos publicar por categoria e por dia.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 rounded-md border p-3 text-xs ${
            message.kind === "ok"
              ? "border-success/30 bg-success/5 text-success"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {message.kind === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {message.text}
        </div>
      )}

              <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="block text-xs font-medium text-muted-foreground">Blog</label>
            <select
              value={blogId}
              onChange={(e) => setBlogId(e.target.value)}
              className="h-9 w-full sm:w-72 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Escolha um blog</option>
              {blogs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {!blogId ? (
            <p className="text-xs text-muted-foreground">Escolha um blog para ver e agendar os artigos aprovados dele.</p>
          ) : (
          <>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="block text-xs font-medium text-muted-foreground">Data inicial</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="block text-xs font-medium text-muted-foreground">Data final</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Dias da semana</span>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={weekdayMode === opt.value ? "primary" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setWeekdayMode(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Categorias e quantidade por dia</span>
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum artigo aprovado com categoria.</p>
            ) : (
              categories.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer min-w-[12rem]">
                    <input
                      type="checkbox"
                      checked={enabled[c.id] ?? true}
                      onChange={(e) => setEnabled((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                      className="h-4 w-4 rounded border-input text-primary"
                    />
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground">({c.count} aprovados)</span>
                  </label>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>por dia:</span>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={perDay[c.id] ?? 1}
                      onChange={(e) =>
                        setPerDay((prev) => ({ ...prev, [c.id]: Number(e.target.value) || 1 }))
                      }
                      className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="block text-xs font-medium text-muted-foreground">Horários do dia (separados por vírgula)</label>
            <input
              type="text"
              value={timesText}
              onChange={(e) => setTimesText(e.target.value)}
              className="h-9 w-full sm:w-72 rounded-md border border-input bg-background px-2 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">Horário de Brasília. Um artigo por horário; até 6 por dia.</p>
          </div>

          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            {preview ? (
              <>
                <p>
                  <strong className="text-foreground">{preview.items.length}</strong> artigo(s) entram no período
                  {preview.items.length > 0 &&
                    `, de ${preview.items[0].date} a ${preview.items[preview.items.length - 1].date}`}.
                </p>
                {Object.values(preview.leftoverByCategory).reduce((s, n) => s + n, 0) > 0 && (
                  <p>
                    Sobram{" "}
                    {Object.values(preview.leftoverByCategory).reduce((s, n) => s + n, 0)} sem vaga no período.
                  </p>
                )}
              </>
            ) : (
              <p>Escolha ao menos uma categoria e um horário.</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSchedule}
              disabled={isWorking || !preview || preview.items.length === 0}
              className="gap-2"
            >
              {isWorking && <Loader2 className="h-4 w-4 animate-spin" />}
              Agendar {preview?.items.length ?? 0} artigo(s)
            </Button>
          </div>
          </>
          )}
        </div>
    </Card>
  );
}
