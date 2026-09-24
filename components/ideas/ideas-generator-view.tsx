"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, CheckCircle2, CalendarPlus, AlertCircle, Tag } from "lucide-react";
import { BlogWithRelations } from "@/types/blog";
import { ContentIdea } from "@/types/ideas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";

interface IdeasGeneratorViewProps {
  blogs: BlogWithRelations[];
}

export function IdeasGeneratorView({ blogs }: IdeasGeneratorViewProps) {
  const router = useRouter();

  const [selectedBlogId, setSelectedBlogId] = useState<string>(blogs[0]?.id || "");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [count, setCount] = useState<number>(5);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [generatedIdeas, setGeneratedIdeas] = useState<ContentIdea[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

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

  const handleSaveToCalendar = async () => {
    if (selectedIndices.size === 0) {
      setError("Selecione pelo menos uma ideia para adicionar ao calendário.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const ideasToSave = generatedIdeas.filter((_, idx) => selectedIndices.has(idx));

    try {
      const response = await fetch("/api/content/ideas/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blogId: selectedBlogId,
          category: selectedCategory || undefined,
          ideas: ideasToSave,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = `Erro ao salvar no calendário (HTTP ${response.status}).`;
        try {
          const errJson = JSON.parse(errorText);
          if (errJson.error) errorMsg = errJson.error;
        } catch {}
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Falha ao adicionar pautas ao calendário.");
      }

      setSuccessMessage(`${data.count} pautas adicionadas com sucesso com status PLANNED! Redirecionando...`);
      setTimeout(() => {
        router.push("/calendar");
        router.refresh();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar pautas no calendário.";
      setError(msg);
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Formulário de Configuração */}
      <Card className="p-6">
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Blog de Destino *
              </label>
              <Select
                value={selectedBlogId}
                onChange={(e) => {
                  setSelectedBlogId(e.target.value);
                  setSelectedCategory("");
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
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
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
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
          {hasInterrupted && remainingCount > 0 && (
            <Button
              type="button"
              onClick={() => handleGenerate(undefined, true)}
              disabled={isLoading || isSaving}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shrink-0 mt-2 sm:mt-0 text-xs h-8"
              size="sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Continuar Gerando ({remainingCount} restantes)
            </Button>
          )}
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Barra de Progresso Real da Fila */}
      {isLoading && (
        <Card className="p-5 border-blue-200 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-950/20 shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-medium">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="font-medium">{queueStatusText || `Processando fila de pautas...`}</span>
              </div>
              <span className="text-xs text-blue-700 dark:text-blue-300 font-semibold font-mono">
                {generatedIdeas.length} de {queueProgress.total || count} geradas ({Math.round((generatedIdeas.length / (queueProgress.total || count || 1)) * 100)}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/40">
              <div
                className="h-full bg-blue-600 transition-all duration-300 ease-out dark:bg-blue-500 rounded-full"
                style={{ width: `${Math.round((generatedIdeas.length / (queueProgress.total || count || 1)) * 100)}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Card inicial enquanto a primeira pauta é gerada */}
      {isLoading && generatedIdeas.length === 0 && (
        <Card className="p-8 text-center border-dashed border-slate-300 dark:border-slate-800">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-500 mb-3" />
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Iniciando fila incremental com Gemini 3.5 Flash...
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cada pauta é gerada de forma individual e aparecerá aqui instantaneamente.
          </p>
        </Card>
      )}

      {/* Lista de Ideias Geradas (Renderização Incremental Imediata) */}
      {generatedIdeas.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="select-all"
                checked={selectedIndices.size === generatedIdeas.length && generatedIdeas.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="select-all" className="text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                Selecionar Todas ({selectedIndices.size} de {generatedIdeas.length} marcadas)
              </label>
            </div>

            <Button
              onClick={handleSaveToCalendar}
              disabled={isSaving || selectedIndices.size === 0}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adicionando ao Calendário...
                </>
              ) : (
                <>
                  <CalendarPlus className="h-4 w-4" />
                  Adicionar Selecionados ao Calendário ({selectedIndices.size})
                </>
              )}
            </Button>
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
                      ? "border-blue-500 bg-blue-50/40 shadow-xs dark:border-blue-500/80 dark:bg-blue-950/20"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectIndex(idx)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                    />

                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {idea.title}
                        </h4>
                        <Badge variant="info" className="text-xs">
                          {idea.type}
                        </Badge>
                      </div>

                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {idea.description}
                      </p>

                      <div className="flex items-center gap-2 pt-1">
                        <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
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
              <Card className="p-5 border-dashed border-blue-300 dark:border-blue-800/60 bg-blue-50/30 dark:bg-blue-950/10">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                    Gerando pauta #{generatedIdeas.length + 1} de {queueProgress.total || count}...
                  </span>
                </div>
              </Card>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveToCalendar}
              disabled={isSaving || selectedIndices.size === 0}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adicionando ao Calendário...
                </>
              ) : (
                <>
                  <CalendarPlus className="h-4 w-4" />
                  Adicionar Selecionados ao Calendário ({selectedIndices.size})
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
