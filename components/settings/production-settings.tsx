"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarClock, Save } from "lucide-react";

export function ProductionSettings() {
  const [days, setDays] = React.useState("2");
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/settings/production")
      .then((res) => res.json())
      .then((j) => {
        if (j.success) setDays(String(j.settings?.production_lead_days ?? 2));
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ production_lead_days: parseInt(days, 10) }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "Falha ao salvar");
      setMsg("Salvo.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" /> Produção automática
        </CardTitle>
        <CardDescription className="text-xs">
          Quantos dias antes da data do calendário o artigo (texto, SEO e imagem) é produzido e enviado para Revisão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Dias de antecedência</label>
            <Input type="number" min={0} max={14} value={days} onChange={(e) => setDays(e.target.value)} className="w-24" />
          </div>
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
