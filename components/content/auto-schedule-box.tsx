"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock, CheckCircle2, Clock, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { autoScheduleApprovedAction, listApprovedUndatedAction } from "@/app/actions/content";
import { buildAutoSchedulePlan, type WeekdayMode } from "@/lib/auto-schedule/plan";

export interface AutoScheduleItem {
  id: string;
  title: string;
  categoryId: string | null;
  categoryName: string;
}

interface AutoScheduleBoxProps {
  blogId: string; // blog do filtro do topo do Calendário
}

const MAX_PER_DAY_PER_CATEGORY = 6;
const MAX_TIMES = 6;
const HORIZON_DAYS = 365; // limite técnico do planejamento; o fim real é quando os artigos acabam

const WEEKDAY_OPTIONS: { value: WeekdayMode; label: string }[] = [
  { value: "all", label: "Todos os dias" },
  { value: "workdays", label: "Dias úteis" },
  { value: "weekends", label: "Só fins de semana" },
];

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

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

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAY_SHORT[date.getDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function readSelectedBlogId(): string {
  try {
    const cookie = document.cookie.match(/(?:^|;\s*)selected_blog_id=([^;]+)/)?.[1];
    const stored = cookie ?? window.localStorage.getItem("selected_blog_id") ?? "";
    return stored && stored !== "all" ? stored : "";
  } catch {
    return "";
  }
}

export function AutoScheduleBox({ blogId: initialBlogId }: AutoScheduleBoxProps) {
  const router = useRouter();
  const tomorrow = useMemo(() => addDays(new Date(), 1), []);
  // Blog do filtro do topo: vem da página; se não veio, usa a seleção atual do navegador.
  const [blogId, setBlogId] = useState<string>(initialBlogId);
  useEffect(() => {
    if (initialBlogId) {
      setBlogId(initialBlogId);
      return;
    }
    setBlogId(readSelectedBlogId());
  }, [initialBlogId]);

  const [items, setItems] = useState<AutoScheduleItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [startDate, setStartDate] = useState(isoDate(tomorrow));
  const [weekdayMode, setWeekdayMode] = useState<WeekdayMode>("all");
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [perDay, setPerDay] = useState<Record<string, number>>({});
  const [times, setTimes] = useState<string[]>(["09:00", "15:00"]);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

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

  const includedItems = useMemo(() => items.filter((i) => !excluded[i.id]), [items, excluded]);
  const isIncluded = (id: string) => !excluded[id];
  const setAllIncluded = (value: boolean) => {
    const next: Record<string, boolean> = {};
    if (!value) for (const item of items) next[item.id] = true;
    setExcluded(next);
  };
  const isEnabled = (id: string) => enabled[id] ?? true;
  const dailyLimit = (id: string) => Math.max(1, Math.min(perDay[id] ?? 1, MAX_PER_DAY_PER_CATEGORY));

  const rules = categories
    .filter((c) => isEnabled(c.id))
    .map((c) => ({ categoryId: c.id, perDay: dailyLimit(c.id) }));

  const dailyTotal = rules.reduce((sum, r) => sum + r.perDay, 0);
  const cleanTimes = useMemo(() => [...new Set(times.filter((t) => /^\d{2}:\d{2}$/.test(t)))].sort(), [times]);

  const problems: string[] = [];
  if (!blogId) problems.push("Escolha um blog no filtro do topo.");
  if (items.length === 0 && !loadingItems && blogId) problems.push("Não há artigos aprovados sem data neste blog.");
  if (items.length > 0 && includedItems.length === 0) problems.push("Selecione ao menos um artigo.");
  if (rules.length === 0) problems.push("Escolha ao menos uma categoria.");
  if (cleanTimes.length === 0) problems.push("Informe ao menos um horário.");

  const plan = useMemo(() => {
    if (problems.length > 0) return null;
    const candidates = includedItems
      .filter((i) => i.categoryId)
      .map((i) => ({ id: i.id, categoryId: i.categoryId, categoryName: i.categoryName, title: i.title }));
    const start = new Date(`${startDate}T12:00:00`);
    return buildAutoSchedulePlan(candidates, {
      startDate,
      endDate: isoDate(addDays(start, HORIZON_DAYS)),
      weekdayMode,
      rules,
      times: cleanTimes,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includedItems, startDate, weekdayMode, JSON.stringify(rules), cleanTimes.join(","), problems.length]);

  const handleSchedule = async () => {
    if (!plan || plan.items.length === 0) return;
    if (!window.confirm(`Agendar ${plan.items.length} artigo(s) a partir de ${formatDay(startDate)}?`)) return;
    setIsWorking(true);
    setMessage(null);
    try {
      const result = await autoScheduleApprovedAction({
        blogId,
        startDate,
        endDate: isoDate(addDays(new Date(`${startDate}T12:00:00`), HORIZON_DAYS)),
        weekdayMode,
        rules,
        times: cleanTimes,
      });
      if (!result.success) {
        setMessage({ kind: "error", text: result.error ?? "Não foi possível agendar." });
      } else {
        const parts = [`${result.scheduled ?? 0} artigo(s) agendado(s).`];
        if (result.leftover) parts.push(`${result.leftover} ficaram sem vaga e seguem aprovados.`);
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

  const updateTime = (index: number, value: string) =>
    setTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
  const removeTime = (index: number) => setTimes((prev) => prev.filter((_, i) => i !== index));
  const addTime = () => setTimes((prev) => (prev.length >= MAX_TIMES ? prev : [...prev, "18:00"]));

  const inputClass =
    "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Publicação automática de aprovados</h3>
            <p className="text-xs text-muted-foreground">
              {loadingItems
                ? "Carregando artigos aprovados..."
                : `${items.length} artigo(s) aprovados e sem data neste blog.`}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 p-5">
        {/* Configuração */}
        <div className="space-y-6">
          {/* Período */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">1. Período</p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Começar em</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${inputClass} w-44`} />
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
                    className="h-8 text-xs"
                    onClick={() => setWeekdayMode(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Categorias */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              2. Categorias e limite por dia
            </p>
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum artigo aprovado com categoria.</p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <label className="flex min-w-0 items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEnabled(c.id)}
                        onChange={(e) => setEnabled((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                        className="h-4 w-4 rounded border-input text-primary"
                      />
                      <span className="truncate text-sm text-foreground">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{c.count} aprovado(s)</span>
                    </label>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">por dia</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_PER_DAY_PER_CATEGORY}
                        value={perDay[c.id] ?? 1}
                        disabled={!isEnabled(c.id)}
                        onChange={(e) =>
                          setPerDay((prev) => ({ ...prev, [c.id]: Number(e.target.value) || 1 }))
                        }
                        className={`${inputClass} w-16 text-center disabled:opacity-50`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Artigos incluídos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Artigos incluídos ({includedItems.length} de {items.length})
              </p>
              <div className="flex items-center gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAllIncluded(true)}>
                  Todos
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAllIncluded(false)}>
                  Nenhum
                </Button>
              </div>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum artigo aprovado sem data neste blog.</p>
            ) : (
              <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {items.map((item) => (
                  <label key={item.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={isIncluded(item.id)}
                      onChange={(e) => setExcluded((prev) => ({ ...prev, [item.id]: !e.target.checked }))}
                      className="h-4 w-4 shrink-0 rounded border-input text-primary"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{item.title}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {item.categoryName}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Horários */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">3. Horário da publicação</p>
            <div className="flex flex-wrap items-center gap-2">
              {times.map((time, index) => (
                <div key={index} className="flex items-center gap-1.5 rounded-md border border-input bg-background pl-2 pr-1">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => updateTime(index, e.target.value)}
                    className="h-9 w-24 bg-transparent text-sm text-foreground focus:outline-none"
                  />
                  {times.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTime(index)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      title="Remover horário"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={addTime}
                disabled={times.length >= MAX_TIMES}
              >
                <Plus className="h-3 w-3" />
                Adicionar horário
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Horário de Brasília. Em cada horário, cada categoria publica um artigo, até o limite diário dela.
            </p>
          </div>
        </div>

        {/* Alertas e agendamento */}
        <div className="col-span-full flex flex-col gap-3">
          {problems.length > 0 && (
            <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              {problems.map((p) => (
                <p key={p} className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {p}
                </p>
              ))}
            </div>
          )}

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

          <div className="flex justify-end">
            <Button onClick={handleSchedule} disabled={isWorking || !plan || plan.items.length === 0 || problems.length > 0} className="gap-2">
              {isWorking && <Loader2 className="h-4 w-4 animate-spin" />}
              Agendar {plan?.items.length ?? 0} artigo(s)
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
