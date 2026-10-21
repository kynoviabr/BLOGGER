"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Webhook } from "lucide-react";

export function WebhooksManager() {
  const [webhooks, setWebhooks] = React.useState<Array<{ id: string; url: string; events: string[] }>>([]);
  const [url, setUrl] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const load = React.useCallback(async () => {
    const r = await fetch("/api/ops/webhooks"); const j = await r.json(); if (j.success) setWebhooks(j.webhooks ?? []);
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!url.startsWith("https://")) { alert("URL precisa ser https://"); return; }
    setSaving(true);
    try { const r = await fetch("/api/ops/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, events: ["dead_letter"] }) }); const j = await r.json(); if (!r.ok || !j.success) throw new Error(j.error || "Falha"); setUrl(""); await load(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    await fetch(`/api/ops/webhooks?id=${id}`, { method: "DELETE" }); await load();
  };
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Webhook className="h-4 w-4 text-primary" /> Webhooks</CardTitle><CardDescription className="text-xs">Notifica dead_letter para Slack/Discord (https, owner/admin)</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/..." /><Button size="sm" onClick={add} disabled={saving}>{saving ? "..." : "Adicionar"}</Button></div>
        {webhooks.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum webhook cadastrado.</p> : <div className="space-y-2">{webhooks.map((w) => <div key={w.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs"><span className="truncate font-mono">{w.url}</span><Button variant="ghost" size="sm" className="h-7" onClick={() => remove(w.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>}
      </CardContent>
    </Card>
  );
}
