"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  CalendarPlus,
  Play,
  AlertCircle,
  FileText,
  Tag,
  ArrowRight,
  Edit3,
} from "lucide-react";
import { BlogWithRelations } from "@/types/blog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SUPPORTED_LANGUAGES } from "@/config/languages";

interface ManualPautaIngestProps {
  blogs: BlogWithRelations[];
  initialBlogId?: string;
}

interface EnhancedPauta {
  title: string;
  topic: string;
  keywords: string;
  description: string;
  article_type: string;
  category_id?: string;
  category_name?: string;
  category_slug?: string;
}

interface CannibalizationInfo {
  isCannibalizing: boolean;
  riskLevel: 'HIGH' | 'MEDIUM' | 'NONE';
  score: number;
  reasons: string[];
  conflictingItems: Array<{
    source: 'WORDPRESS' | 'CALENDAR';
    title: string;
    url?: string;
    status?: string;
    similarityScore: number;
  }>;
}

export function ManualPautaIngest({ blogs, initialBlogId }: ManualPautaIngestProps) {
  const router = useRouter();

  const activeInitialBlog = initialBlogId ? blogs.find((b) => b.id === initialBlogId) : null;
  const [selectedBlogId, setSelectedBlogId] = useState<string>(
    activeInitialBlog?.id || blogs[0]?.id || ""
  );
  const [selectedLanguage, setSelectedLanguage] = useState<string>(
    activeInitialBlog?.default_language || blogs[0]?.default_language || "pt-BR"
  );

  // Sincroniza se o blog ativo for alterado no Topbar ou query params
  React.useEffect(() => {
    if (initialBlogId && blogs.some((b) => b.id === initialBlogId)) {
      setSelectedBlogId(initialBlogId);
      const b = blogs.find((item) => item.id === initialBlogId);
      if (b?.default_language) {
        setSelectedLanguage(b.default_language);
      }
    }
  }, [initialBlogId, blogs]);
  const [rawText, setRawText] = useState("");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [enhancedPauta, setEnhancedPauta] = useState<EnhancedPauta | null>(null);
  const [cannibalization, setCannibalization] = useState<CannibalizationInfo | null>(null);

  const currentBlog = blogs.find((b) => b.id === selectedBlogId);
  const categoriesToDisplay = currentBlog?.categories || [];

  const handleEnhance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) {
      setError("Por favor, cole o tema ou texto da sua pauta bruta.");
      return;
    }

    setIsEnhancing(true);
    setError(null);
    setSuccessMsg(null);
    setEnhancedPauta(null);
    setCannibalization(null);

    try {
      const res = await fetch("/api/content/ideas/enhance-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          blogId: selectedBlogId,
          language: selectedLanguage,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao aprimorar pauta com IA.");
      }

      setEnhancedPauta(data.enhanced);
      setCannibalization(data.cannibalization || null);
      setSuccessMsg("Pauta aprimorada com sucesso! Revise os detalhes abaixo antes de salvar.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleSaveToCalendar = async (executeNow: boolean = false) => {
    if (!enhancedPauta) return;

    setIsSaving(true);
    setError(null);

    try {
      const keywordsArray = enhancedPauta.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      const res = await fetch("/api/content/ideas/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blogId: selectedBlogId,
          language: selectedLanguage,
          ideas: [
            {
              title: enhancedPauta.title,
              keywords: enhancedPauta.keywords,
              description: enhancedPauta.description,
              type: enhancedPauta.article_type,
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao salvar pauta no calendário.");
      }

      const createdItem = data.results?.[0];

      if (executeNow && createdItem?.id) {
        router.push(`/calendar?execute=${createdItem.id}`);
      } else {
        setSuccessMsg("Pauta salva com sucesso no Calendário Editorial!");
        setRawText("");
        setEnhancedPauta(null);
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar no calendário.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alertas */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Formulário de Ingestão Bruta */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Colar Pauta Manual & Aprimorar com IA
          </CardTitle>
          <CardDescription className="text-xs">
            Cole um título bruto, link, notícia ou anotações. A inteligência artificial irá lapidar o título para alto CTR, definir palavras-chave de SEO e estruturar o briefing editorial.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEnhance} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Blog de Destino *
                </label>
                <Select
                  value={selectedBlogId}
                  onChange={(e) => setSelectedBlogId(e.target.value)}
                  disabled={isEnhancing}
                >
                  {blogs.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.niche})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Idioma do Artigo *
                </label>
                <Select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  disabled={isEnhancing}
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Conteúdo ou Tema Bruto da Pauta *
              </label>
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Exemplo: Saiu nova resolução do Banco Central limitando os juros do rotativo do cartão de crédito. Fazer guia explicando como calcular e quais bancos já aplicam a nova taxa."
                rows={4}
                disabled={isEnhancing}
                className="text-sm font-normal"
                required
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={isEnhancing || !rawText.trim()}
                className="gap-2"
              >
                {isEnhancing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Aprimorando Pauta com IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Aprimorar Pauta com IA
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Resultado Aprimorado pela IA */}
      {enhancedPauta && (
        <Card className="border-primary/40 bg-card shadow-card-hover animate-fadeIn">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Pauta Aprimorada
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">
                  {enhancedPauta.title.length} caracteres
                </span>
              </div>
              <span className="text-xs text-primary font-medium">
                Categoria: {enhancedPauta.category_name}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {/* Guardião Anti-Canibalização */}
            {cannibalization && cannibalization.isCannibalizing && (
              <div
                className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                  cannibalization.riskLevel === 'HIGH'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {cannibalization.riskLevel === 'HIGH'
                      ? '🔴 ALTO RISCO DE CANIBALIZAÇÃO SEO'
                      : '🟡 ALERTA DE SOBREPOSIÇÃO TEMÁTICA'}{' '}
                    ({Math.round(cannibalization.score * 100)}% de similaridade)
                  </span>
                </div>
                {cannibalization.reasons.map((r, i) => (
                  <p key={i} className="text-muted-foreground leading-relaxed">
                    {r}
                  </p>
                ))}
                {cannibalization.conflictingItems.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                      Conteúdos Concorrentes Identificados:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-[11px]">
                      {cannibalization.conflictingItems.slice(0, 3).map((item, idx) => (
                        <li key={idx} className="leading-snug">
                          <span className="font-medium text-foreground">[{item.source}]</span>{' '}
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline hover:text-foreground text-primary font-medium"
                            >
                              {item.title}
                            </a>
                          ) : (
                            <span className="text-foreground">{item.title}</span>
                          )}{' '}
                          <span className="opacity-75">
                            ({Math.round(item.similarityScore * 100)}% similar)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Título H1 Definido para Alto CTR (Editável):
              </label>
              <Input
                value={enhancedPauta.title}
                onChange={(e) =>
                  setEnhancedPauta({ ...enhancedPauta, title: e.target.value })
                }
                className="font-semibold text-sm text-foreground"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Palavras-Chave Foco (SEO):
                </label>
                <Input
                  value={enhancedPauta.keywords}
                  onChange={(e) =>
                    setEnhancedPauta({ ...enhancedPauta, keywords: e.target.value })
                  }
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Formato do Artigo:
                </label>
                <Select
                  value={enhancedPauta.article_type}
                  onChange={(e) =>
                    setEnhancedPauta({ ...enhancedPauta, article_type: e.target.value })
                  }
                >
                  <option value="standard">Artigo Padrão (1.200 a 1.500 palavras)</option>
                  <option value="listicle">Lista / Ranking (Top Melhores)</option>
                  <option value="how-to">Passo a Passo / Tutorial</option>
                  <option value="review">Análise Detalhada / Review</option>
                  <option value="pillar">Super-Pilar / Guia Completo (+2.000 palavras)</option>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Briefing & Estrutura Sugerida pela IA:
              </label>
              <Textarea
                value={enhancedPauta.description}
                onChange={(e) =>
                  setEnhancedPauta({ ...enhancedPauta, description: e.target.value })
                }
                rows={3}
                className="text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEnhancedPauta(null)}
                className="text-xs text-muted-foreground"
              >
                Descartar
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSaveToCalendar(false)}
                  disabled={isSaving}
                  className="gap-1.5 text-xs"
                >
                  <CalendarPlus className="h-3.5 w-3.5 text-primary" />
                  Salvar no Calendário Editorial
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSaveToCalendar(true)}
                  disabled={isSaving}
                  className="gap-1.5 text-xs bg-success text-white hover:brightness-95 font-semibold"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Salvar e Executar Agora
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
