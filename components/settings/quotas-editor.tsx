"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Save, Shield } from "lucide-react";

export function QuotasEditor() {
  const [quotas, setQuotas] = React.useState<{ monthly_article_limit?: number; monthly_image_limit?: number; monthly_token_limit?: number | null; enabled?: boolean; articles_this_month?: number; images_this_month?: number } | null>(null);
  const [form, setForm] = React.useState<{ monthly_article_limit: string; monthly_image_limit: string; enabled: boolean }>({ monthly_article_limit: "100", monthly_image_limit: "200", enabled: true });
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/ops/quotas");
    const j = await res.json();
    if (j.success) {
      setQuotas(j.quotas);
      setForm({ monthly_article_limit: String(j.quotas.monthly_article_limit ?? 100), monthly_image_limit: String(j.quotas.monthly_image_limit ?? 200), enabled: j.quotas.enabled !== false });
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/ops/quotas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly_article_limit: parseInt(form.monthly_article_limit, 10) || 100, monthly_image_limit: parseInt(form.monthly_image_limit, 10) || 200, enabled: form.enabled }) });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "Falha");
      setMsg("Quotas salvas com sucesso (owner/admin).");
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Quotas por Organização</CardTitle>
        <CardDescription className="text-xs">Limites mensais — apenas owner/admin pode editar. Consumo: {quotas?.articles_this_month ?? 0} artigos / {quotas?.monthly_article_limit ?? 100} · {quotas?.images_this_month ?? 0} imagens / {quotas?.monthly_image_limit ?? 200}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium text-muted-foreground">Artigos/mês</label><Input value={form.monthly_article_limit} onChange={(e) => setForm((s) => ({ ...s, monthly_article_limit: e.target.value }))} placeholder="100" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Imagens/mês</label><Input value={form.monthly_image_limit} onChange={(e) => setForm((s) => ({ ...s, monthly_image_limit: e.target.value }))} placeholder="200" /></div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))} /> Ativo</label>
          {quotas?.enabled === false ? <Badge variant="warning">desativado</Badge> : <Badge variant="success">ativo</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5"><Save className="h-3.5 w-3.5" />{saving ? "Salvando..." : "Salvar"}</Button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
