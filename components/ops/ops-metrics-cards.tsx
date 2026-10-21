"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, Clock, CheckCircle2, Coins, BarChart3 } from "lucide-react";

type Metrics = {
  jobs_by_status: Record<string, number>;
  jobs_by_type_7d: Record<string, number>;
  ai_runs_7d: { total: number; completed: number; failed: number; avg_duration_ms: number; total_cost: number };
  quotas: { monthly_article_limit?: number; monthly_image_limit?: number; articles_this_month?: number; images_this_month?: number; enabled?: boolean };
};

export function OpsMetricsCards() {
  const [metrics, setMetrics] = React.useState<Metrics | null>(null);
  const [deadLetters, setDeadLetters] = React.useState<Array<{ id: string; job_type: string; last_error: string | null; created_at: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [replaying, setReplaying] = React.useState<string | null>(null);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, dRes] = await Promise.all([
        fetch("/api/ops/metrics?days=7").then((r) => r.json()),
        fetch("/api/ops/dead-letters").then((r) => r.json()).catch(() => ({ jobs: [] })),
      ]);
      if (mRes?.success) setMetrics(mRes.metrics);
      if (dRes?.success) setDeadLetters(dRes.jobs ?? dRes.deadLetters ?? []);
      else if (Array.isArray(dRes?.jobs)) setDeadLetters(dRes.jobs);
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  const replay = async (jobId: string) => {
    setReplaying(jobId);
    try {
      const res = await fetch("/api/jobs/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "Falha");
      await fetchAll();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setReplaying(null); }
  };

  if (loading && !metrics) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando métricas...</CardContent></Card>;

  const byStatus = metrics?.jobs_by_status ?? {};
  const byType = metrics?.jobs_by_type_7d ?? {};
  const ai = metrics?.ai_runs_7d;
  const quotas = metrics?.quotas;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Operação (7d)</h3>
        <Button variant="outline" size="sm" onClick={fetchAll} className="h-7 text-xs gap-1.5"><RefreshCw className="h-3 w-3" /> Atualizar</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardHeader className="pb-2"><CardDescription className="text-xs">Fila</CardDescription></CardHeader><CardContent className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">queued</span><Badge variant="info">{byStatus.queued ?? 0}</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">retrying</span><Badge variant="warning">{byStatus.retrying ?? 0}</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">running</span><Badge variant="info">{byStatus.running ?? 0}</Badge></div>
          <div className="flex justify-between"><span className="text-amber-600">dead_letter</span><Badge variant="error">{byStatus.dead_letter ?? 0}</Badge></div>
        </CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription className="text-xs">Por tipo (7d)</CardDescription></CardHeader><CardContent className="space-y-1 text-xs">
          {Object.keys(byType).length ? Object.entries(byType).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-mono font-medium">{String(v)}</span></div>) : <span className="text-muted-foreground">—</span>}
        </CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription className="text-xs flex items-center gap-1.5"><Coins className="h-3 w-3" /> AI (7d)</CardDescription></CardHeader><CardContent className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">runs</span><span className="font-mono">{ai?.total ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">completed</span><span className="font-mono text-emerald-600">{ai?.completed ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">avg</span><span className="font-mono">{ai?.avg_duration_ms ?? 0}ms</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">custo</span><span className="font-mono">${Number(ai?.total_cost ?? 0).toFixed(4)}</span></div>
        </CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription className="text-xs">Quotas (mês)</CardDescription></CardHeader><CardContent className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">artigos</span><span className="font-mono">{quotas?.articles_this_month ?? 0} / {quotas?.monthly_article_limit ?? 100}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">imagens</span><span className="font-mono">{quotas?.images_this_month ?? 0} / {quotas?.monthly_image_limit ?? 200}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">status</span>{quotas?.enabled === false ? <Badge variant="warning">desativado</Badge> : <Badge variant="success">ativo</Badge>}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Dead Letters</CardTitle>
          <CardDescription className="text-xs">Jobs que excederam tentativas — apenas owner/admin pode reprocessar (rate-limited)</CardDescription>
        </CardHeader>
        <CardContent>
          {deadLetters.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum dead_letter no momento.</p> : (
            <div className="space-y-2">
              {deadLetters.map((j) => (
                <div key={j.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs"><Badge variant="error" className="text-[10px]">{j.job_type}</Badge><span className="font-mono text-[11px] text-muted-foreground truncate">{j.id}</span></div>
                    <p className="text-xs text-foreground mt-1 line-clamp-2">{j.last_error || "—"}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(j.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 shrink-0" onClick={() => replay(j.id)} disabled={replaying === j.id}><CheckCircle2 className="h-3.5 w-3.5" />{replaying === j.id ? "..." : "Reprocessar"}</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
