"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, CheckCircle2, AlertCircle, Tag, Bookmark, PenLine } from "lucide-react";
import { startArticleGeneration } from "@/lib/ideas/start-generation";
import { saveIdeasBatch } from "@/lib/ideas/save-ideas";
import { BlogWithRelations } from "@/types/blog";
import { ContentIdea } from "@/types/ideas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, getLanguageConfig } from "@/config/languages";

interface DuplicateCheck {
  riskLevel: "HIGH" | "MEDIUM" | "NONE";
  score: number;
  conflict: { title: string; source: string } | null;
}

const DUPLICATE_SOURCE_LABELS: Record<string, string> = {
  WORDPRESS: "post publicado",
  CALENDAR: "pauta",
  CONTENT: "artigo",
  BATCH: "outra ideia desta lista",
};

interface IdeasGeneratorViewProps {
  blogs: BlogWithRelations[];
  initialBlogId?: string;
}

export function IdeasGeneratorView({ blogs, initialBlogId }: IdeasGeneratorViewProps) {
  const router = useRouter();

  const activeInitialBlog = initialBlogId ? blogs.find((b) => b.id === initialBlogId) : null;
  const [selectedBlogId, setSelectedBlogId] = useState<string>(
    activeInitialBlog?.id || blogs[0]?.id || ""
  );
  const [selectedLanguage, setSelectedLanguage] = useState<string>(
    activeInitialBlog?.default_language || blogs[0]?.default_language || "pt-BR"
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [count, setCount] = useState<number>(5);

  // Sincroniza se o blog ativo for alterado no Topbar ou query params
  React.useEffect(() => {
    if (initialBlogId && blogs.some((b) => b.id === initialBlogId)) {
      setSelectedBlogId(initialBlogId);
      setSelectedCategory("");
      const b = blogs.find((item) => item.id === initialBlogId);
      if (b?.default_language) {
        setSelectedLanguage(b.default_language);
      }
    }
  }, [initialBlogId, blogs]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [generatedIdeas, setGeneratedIdeas] = useState<ContentIdea[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [duplicateChecks, setDuplicateChecks] = useState<Record<string, DuplicateCheck>>({});

  // Depois que a fila termina, compara cada ideia com o que já existe NESTE blog e entre si.
  React.useEffect(() => {
    if (isLoading || generatedIdeas.length === 0 || !selectedBlogId) return;
    let cancelled = false;
    fetch("/api/content/ideas/check-duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blogId: selectedBlogId,
        ideas: generatedIdeas.map((idea) => ({ title: idea.title, keywords: idea.keywords })),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success) return;
        const byTitle: Record<string, DuplicateCheck> = {};
        generatedIdeas.forEach((idea, idx) => {
          if (data.results[idx]) byTitle[idea.title] = data.results[idx];
        });
        setDuplicateChecks(byTitle);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoading, generatedIdeas, selectedBlogId]);

  // Estado da Fila Unitária
  const [queueProgress, setQueueProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [queueStatusText, setQueueStatusText] = useState<string>("");
  const [hasInterrupted, setHasInterrupted] = useState<boolean>(false);
  const [remainingCount, setRemainingCount] = useState<number>(0);

  // Categorias disponíveis pertencentes ESTRITAMENTE ao blog selecionado
  const currentBlog = blogs.find((b) => b.id === selectedBlogId);
  const categoriesToDisplay = currentBlog?.categories || [];

  /**
   * Executa a fila de geração unitária sequencial.
   * Pode iniciar do zero ou continuar de onde parou.
   */
  const handleGenerate = async (e?: React.FormEvent, continueFromRemaining: boolean = false) => {
    if (e) e.preventDefault();
    if (!selectedBlogId) {
      setError("Por favor, selecione um blog.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setHasInterrupted(false);

    let currentIdeas: ContentIdea[] = continueFromRemaining ? [...generatedIdeas] : [];
    if (!continueFromRemaining) {
      setGeneratedIdeas([]);
      setSelectedIndices(new Set());
    }

    const totalToGenerate = continueFromRemaining ? currentIdeas.length + remainingCount : count;
    let generatedCount = currentIdeas.length;
    let failedAttempts = 0;
    let consecutiveFailures = 0;
    const startTime = Date.now();

    try {
      while (generatedCount < totalToGenerate) {
        const currentPos = generatedCount + 1;
        setQueueProgress({ current: currentPos, total: totalToGenerate });
        setQueueStatusText(`Gerando pauta ${currentPos} de ${totalToGenerate} com Gemini...`);

        // Prepara resumo das pautas já acumuladas para evitar duplicidades
        const existingSummary = currentIdeas.map((i) => ({
          title: i.title,
          keywords: i.keywords,
          type: i.type,
        }));

        let itemSuccess = false;
        let lastItemError = "";

        // Até 1 retry para a mesma pauta em caso de oscilação
        for (let attempt = 0; attempt <= 1; attempt++) {
          try {
            const response = await fetch("/api/content/ideas/generate-one", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                blogId: selectedBlogId,
                category: selectedCategory || undefined,
                language: selectedLanguage,
                existingIdeas: existingSummary,
                queuePosition: currentPos,
                totalRequested: totalToGenerate,
              }),
            });

            // Tratamento robusto contra HTML de erro da Vercel / 504 / non-JSON
            if (!response.ok) {
              const errorText = await response.text();
              let errorMsg = `Erro no servidor (HTTP ${response.status}).`;

              if (response.status === 504) {
                errorMsg = "Tempo limite na geração da pauta.";
              } else {
                try {
                  const errJson = JSON.parse(errorText);
                  if (errJson.error) errorMsg = errJson.error;
                } catch {
                  // Payload não é JSON (ex: HTML/texto de erro de gateway)
                  errorMsg = `Serviço indisponível temporariamente (HTTP ${response.status}).`;
                }
              }
              throw new Error(errorMsg);
            }

            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
              throw new Error("Resposta do servidor não está em formato JSON válido.");
            }

            const data = await response.json();
            if (!data.success || !data.idea) {
              throw new Error(data.error || "Pauta retornada vazia ou incompleta.");
            }

            // Sucesso na pauta atual
            const newIdea: ContentIdea = data.idea;
            currentIdeas = [...currentIdeas, newIdea];
            setGeneratedIdeas([...currentIdeas]);

            // Seleciona a nova pauta na lista automaticamente
            const newIndex = currentIdeas.length - 1;
            setSelectedIndices((prev) => new Set([...prev, newIndex]));

            generatedCount++;
            consecutiveFailures = 0;
            itemSuccess = true;
            break; // Sai do loop de retry desta pauta
          } catch (err: unknown) {
            lastItemError = err instanceof Error ? err.message : "Falha na comunicação com a IA.";
            if (attempt === 0) {
              // Breve intervalo antes do retry
              await new Promise((r) => setTimeout(r, 1200));
            }
          }
        }

        if (!itemSuccess) {
          failedAttempts++;
          consecutiveFailures++;

          // Se houver 2 falhas consecutivas, interrompe a fila para proteger a sessão
          if (consecutiveFailures >= 2) {
            const remaining = totalToGenerate - generatedCount;
            setError(
              `${generatedCount} de ${totalToGenerate} pautas foram geradas. A geração foi interrompida após falhas consecutivas (${lastItemError}). As pautas já geradas foram preservadas abaixo.`
            );
            setHasInterrupted(true);
            setRemainingCount(remaining);

            // Log de fila interrompida
            fetch("/api/content/ideas/queue-log", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "interrupted",
                requested: totalToGenerate,
                generated: generatedCount,
                remaining,
                failed: failedAttempts,
                totalDurationMs: Date.now() - startTime,
                blogId: selectedBlogId,
                category: selectedCategory,
              }),
            }).catch(() => {});

            setIsLoading(false);
            return;
          }
        }
      }

      // Fila concluída com sucesso total
      setSuccessMessage(`Todas as ${generatedCount} pautas foram geradas com sucesso!`);
      setHasInterrupted(false);
      setRemainingCount(0);

      // Log de fila concluída
      fetch("/api/content/ideas/queue-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          requested: totalToGenerate,
          generated: generatedCount,
          remaining: 0,
          failed: failedAttempts,
          totalDurationMs: Date.now() - startTime,
          blogId: selectedBlogId,
          category: selectedCategory,
        }),
      }).catch(() => {});
    } catch (generalErr: unknown) {
      const msg = generalErr instanceof Error ? generalErr.message : "Ocorreu um erro ao processar a fila.";
      setError(msg);
    } finally {
      setIsLoading(false);
      setQueueStatusText("");
    }
  };

  const toggleSelectIndex = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === generatedIdeas.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(generatedIdeas.map((_, i) => i)));
    }
  };

  const handleSaveIdeas = async (mode: "idea" | "generate") => {
    if (selectedIndices.size === 0) {
      setError("Selecione pelo menos uma ideia.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    const ideasToSave = generatedIdeas.filter((_, idx) => selectedIndices.has(idx));

    try {
      const data = await saveIdeasBatch({
        blogId: selectedBlogId,
        category: selectedCategory || undefined,
        ideas: ideasToSave,
        mode,
      });
      if (!data) return;

      if (mode === "generate") {
        const ids = (data.data as Array<{ id: string }>).map((row) => row.id);
        const { started, failed } = await startArticleGeneration(ids);
        setSuccessMessage(
          `${started.length} artigo(s) sendo escritos. Eles aparecem em Content como "Em revisão" quando ficarem prontos.` +
            (failed.length ? ` ${failed.length} não puderam ser iniciados e ficaram em "Ideias salvas".` : "")
        );
      } else {
        setSuccessMessage(`${data.count} ideia(s) salvas. Elas ficam na aba "Ideias salvas" até você gerar os artigos.`);
      }

      setGeneratedIdeas((prev) => prev.filter((_, idx) => !selectedIndices.has(idx)));
      setSelectedIndices(new Set());
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar as ideias.";
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Formulário de Configuração */}
      <Card className="p-6">
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Blog de Destino *
              </label>
              <Select
                value={selectedBlogId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSelectedBlogId(newId);
                  setSelectedCategory("");
                  const b = blogs.find((item) => item.id === newId);
                  if (b?.default_language) {
                    setSelectedLanguage(b.default_language);
                  }
                }}
                disabled={isLoading || isSaving}
                required
              >
                {blogs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Idioma da Pauta *
              </label>
              <Select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                disabled={isLoading || isSaving}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name} ({lang.code})
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Categoria de Conteúdo
              </label>
              <Select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={isLoading || isSaving}
              >
                <option value="">Todas as Categorias / Geral</option>
                {categoriesToDisplay.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Quantidade de Ideias
              </label>
              <Select
                value={String(count)}
                onChange={(e) => setCount(Number(e.target.value))}
                disabled={isLoading || isSaving}
              >
                <option value="5">5 Ideias Estratégicas</option>
                <option value="7">7 Ideias Estratégicas</option>
                <option value="10">10 Ideias Estratégicas</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              A IA analisará o nicho, público-alvo e regras de SEO do blog selecionado para sugerir temas prontos.
            </p>

            <Button type="submit" disabled={isLoading || isSaving} className="gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando com Gemini...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Gerar Ideias
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Alertas */}
      {error && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-brand-card border border-destructive/25 bg-[hsl(var(--danger-bg))] p-4 text-xs text-destructive ">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
          {hasInterrupted && remainingCount > 0 && (
            <Button
              type="button"
              onClick={() => handleGenerate(undefined, true)}
              disabled={isLoading || isSaving}
              className="gap-1.5 bg-warning hover:brightness-95 text-white shrink-0 mt-2 sm:mt-0 text-xs h-8"
              size="sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Continuar Gerando ({remainingCount} restantes)
            </Button>
          )}
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-2.5 rounded-brand-card border border-success/25 bg-[hsl(var(--success-bg))] p-4 text-xs text-success dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Barra de Progresso Real da Fila */}
      {isLoading && (
        <Card className="p-5 border-primary/25 bg-[hsl(var(--info-bg))] dark:border-blue-900/50 dark:bg-blue-950/20 shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-medium">
              <div className="flex items-center gap-2 text-primary dark:text-blue-300">
                <Loader2 className="h-4 w-4 animate-spin text-primary dark:text-blue-400" />
                <span className="font-medium">{queueStatusText || `Processando fila de pautas...`}</span>
              </div>
              <span className="text-xs text-primary dark:text-blue-300 font-semibold font-mono">
                {generatedIdeas.length} de {queueProgress.total || count} geradas ({Math.round((generatedIdeas.length / (queueProgress.total || count || 1)) * 100)}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[hsl(var(--primary-light))] dark:bg-blue-900/40">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out dark:bg-blue-500 rounded-full"
                style={{ width: `${Math.round((generatedIdeas.length / (queueProgress.total || count || 1)) * 100)}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Card inicial enquanto a primeira pauta é gerada */}
      {isLoading && generatedIdeas.length === 0 && (
        <Card className="p-8 text-center border-dashed border-slate-300 ">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary mb-3" />
          <h4 className="text-sm font-semibold text-foreground">
            Iniciando fila incremental com Gemini 3.5 Flash...
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            Cada pauta é gerada de forma individual e aparecerá aqui instantaneamente.
          </p>
        </Card>
      )}

      {/* Lista de Ideias Geradas (Renderização Incremental Imediata) */}
      {generatedIdeas.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3 ">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="select-all"
                checked={selectedIndices.size === generatedIdeas.length && generatedIdeas.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
              />
              <label htmlFor="select-all" className="text-sm font-semibold text-foreground cursor-pointer">
                Selecionar Todas ({selectedIndices.size} de {generatedIdeas.length} marcadas)
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => handleSaveIdeas("idea")}
                disabled={isSaving || selectedIndices.size === 0}
                className="gap-2"
              >
                <Bookmark className="h-4 w-4" />
                Salvar para depois
              </Button>
              <Button
                onClick={() => handleSaveIdeas("generate")}
                disabled={isSaving || selectedIndices.size === 0}
                className="gap-2 bg-success hover:brightness-95 text-white w-full sm:w-auto"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                Gerar artigos ({selectedIndices.size})
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {generatedIdeas.map((idea, idx) => {
              const isSelected = selectedIndices.has(idx);

              return (
                <Card
                  key={idx}
                  onClick={() => toggleSelectIndex(idx)}
                  className={`p-5 transition-all cursor-pointer border ${
                    isSelected
                      ? "border-primary bg-[hsl(var(--primary-light))] shadow-card"
                      : "border-slate-200 hover:border-slate-300  dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectIndex(idx)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer shrink-0"
                    />

                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-base font-semibold text-foreground">
                          {idea.title}
                        </h4>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {idea.category && (
                            <Badge variant="outline" className="text-xs font-medium border-primary/30 text-primary bg-primary/5">
                              {idea.category}
                            </Badge>
                          )}
                          <Badge variant="info" className="text-xs">
                            {idea.type}
                          </Badge>
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {idea.description}
                      </p>

                      {duplicateChecks[idea.title] && duplicateChecks[idea.title].riskLevel !== "NONE" && (
                        <div
                          className={`flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
                            duplicateChecks[idea.title].riskLevel === "HIGH"
                              ? "border-destructive/30 bg-destructive/5 text-destructive"
                              : "border-warning/30 bg-warning/5 text-warning"
                          }`}
                        >
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>
                            {duplicateChecks[idea.title].riskLevel === "HIGH" ? "Provável duplicada" : "Parecida"} (
                            {Math.round(duplicateChecks[idea.title].score * 100)}%)
                            {duplicateChecks[idea.title].conflict &&
                              ` com ${DUPLICATE_SOURCE_LABELS[duplicateChecks[idea.title].conflict!.source] ?? "conteúdo"} "${duplicateChecks[idea.title].conflict!.title}"`}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <Tag className="h-3.5 w-3.5 text-[hsl(var(--text-muted))] shrink-0" />
                        <span className="text-xs text-muted-foreground font-mono">
                          {idea.keywords}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}

            {/* Indicador de próxima pauta sendo gerada */}
            {isLoading && (
              <Card className="p-5 border-dashed border-blue-300 dark:border-blue-800/60 bg-[hsl(var(--primary-light))] dark:bg-blue-950/10">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary dark:text-blue-400 shrink-0" />
                  <span className="text-sm text-primary dark:text-blue-300 font-medium">
                    Gerando pauta #{generatedIdeas.length + 1} de {queueProgress.total || count}...
                  </span>
                </div>
              </Card>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => handleSaveIdeas("idea")}
                disabled={isSaving || selectedIndices.size === 0}
                className="gap-2"
              >
                <Bookmark className="h-4 w-4" />
                Salvar para depois
              </Button>
              <Button
                onClick={() => handleSaveIdeas("generate")}
                disabled={isSaving || selectedIndices.size === 0}
                className="gap-2 bg-success hover:brightness-95 text-white"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                Gerar artigos ({selectedIndices.size})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
