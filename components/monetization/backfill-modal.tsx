"use client";

import * as React from "react";
import { useState } from "react";
import {
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { BlogWithRelations } from "@/types/blog";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { BackfillBatchResult } from "@/services/monetization/monetization-backfill.service";

import { backfillMonetizationAction } from "@/app/actions/monetization";

interface BackfillModalProps {
  isOpen: boolean;
  onClose: () => void;
  blogs: BlogWithRelations[];
  defaultBlogId?: string;
  onSuccess?: () => void;
}

export function BackfillModal({
  isOpen,
  onClose,
  blogs,
  defaultBlogId,
  onSuccess,
}: BackfillModalProps) {
  const [selectedBlogId, setSelectedBlogId] = useState<string>(
    defaultBlogId || (blogs[0]?.id ?? "")
  );
  const [forceUpdateExisting, setForceUpdateExisting] = useState<boolean>(true);
  const [syncWordPress, setSyncWordPress] = useState<boolean>(true);
  const [statuses, setStatuses] = useState<string[]>(["published", "ready", "draft"]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<BackfillBatchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  React.useEffect(() => {
    if (defaultBlogId) {
      setSelectedBlogId(defaultBlogId);
    } else if (blogs.length > 0 && !selectedBlogId) {
      setSelectedBlogId(blogs[0].id);
    }
  }, [defaultBlogId, blogs, selectedBlogId]);

  const handleToggleStatus = (status: string) => {
    setStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  };

  const handleExecute = async () => {
    if (!selectedBlogId) {
      setErrorMsg("Selecione um blog para retroalimentar.");
      return;
    }

    if (statuses.length === 0) {
      setErrorMsg("Selecione ao menos um status de artigo para processar.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const res = await backfillMonetizationAction({
        blogId: selectedBlogId,
        forceUpdateExisting,
        syncWordPress,
        statusFilter: statuses as ("published" | "ready" | "draft")[],
      });

      if (!res.success || !res.data) {
        throw new Error(res.error || "Falha ao executar retroalimentação.");
      }

      setResult(res.data as BackfillBatchResult);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isLoading) {
          setResult(null);
          setErrorMsg(null);
          onClose();
        }
      }}
      title="Retroalimentação (Backfill) de Monetização"
    >
      <div className="space-y-5 text-sm">
        <p className="text-xs text-muted-foreground">
          Injeta deterministicamente os boxes HTML de ofertas de monetização em todos os artigos já cadastrados do blog, sem chamada à IA e com sincronização direta nos posts publicados no WordPress.
        </p>

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-md border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {!result ? (
          <div className="space-y-4">
            {/* Seleção do Blog */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Blog Alvo:
              </label>
              <select
                value={selectedBlogId}
                onChange={(e) => setSelectedBlogId(e.target.value)}
                disabled={isLoading}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {blogs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.domain})
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro de Status */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Status dos Artigos a Processar:
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "published", label: "Publicados (WordPress)" },
                  { id: "ready", label: "Prontos (Ready)" },
                  { id: "draft", label: "Rascunhos (Draft)" },
                ].map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer select-none transition-colors ${
                      statuses.includes(s.id)
                        ? "border-teal-500/50 bg-teal-500/10 text-teal-900 dark:text-teal-200"
                        : "border-slate-200 dark:border-slate-800 text-muted-foreground"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={statuses.includes(s.id)}
                      onChange={() => handleToggleStatus(s.id)}
                      disabled={isLoading}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 h-3 w-3"
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Opções de Injeção */}
            <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/30">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                <input
                  type="checkbox"
                  checked={forceUpdateExisting}
                  onChange={(e) => setForceUpdateExisting(e.target.checked)}
                  disabled={isLoading}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 h-3.5 w-3.5"
                />
                <span className="text-foreground font-medium">
                  Substituir boxes de ofertas existentes (Idempotência garantida)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                <input
                  type="checkbox"
                  checked={syncWordPress}
                  onChange={(e) => setSyncWordPress(e.target.checked)}
                  disabled={isLoading}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 h-3.5 w-3.5"
                />
                <span className="text-foreground font-medium">
                  Sincronizar imediatamente posts já publicados no WordPress via REST API
                </span>
              </label>
            </div>

            {/* Ações */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleExecute}
                disabled={isLoading}
                className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processando Artigos...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Iniciar Retroalimentação
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* Resultados da Execução */
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-teal-500/20 bg-teal-500/10 p-3 text-center">
                <div className="text-lg font-bold text-teal-700 dark:text-teal-300">
                  {result.updatedCount}
                </div>
                <div className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">
                  Atualizados
                </div>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-center">
                <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
                  {result.skippedCount}
                </div>
                <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  Ignorados
                </div>
              </div>
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-center">
                <div className="text-lg font-bold text-rose-700 dark:text-rose-300">
                  {result.errorsCount}
                </div>
                <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                  Erros
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-900/50 text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-foreground">
                  Resumo detalhado ({result.results.length} artigos processados):
                </span>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-primary hover:underline inline-flex items-center gap-1 text-[11px]"
                >
                  {showDetails ? (
                    <>
                      Ocultar detalhes <ChevronUp className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Ver detalhes <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </button>
              </div>

              {showDetails && (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {result.results.map((r) => (
                    <div
                      key={r.articleId}
                      className="p-2 rounded bg-background border border-slate-100 dark:border-slate-800 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-foreground line-clamp-1">
                          {r.title}
                        </strong>
                        <span
                          className={`font-semibold shrink-0 ${
                            r.supabaseUpdated
                              ? "text-teal-600 dark:text-teal-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {r.supabaseUpdated ? "Atualizado" : "Ignorado"}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-2">
                        <span>Status: {r.status}</span>
                        {r.offersInjected.length > 0 && (
                          <span>Ofertas: {r.offersInjected.join(", ")}</span>
                        )}
                        {r.wordpressSynced && (
                          <span className="text-emerald-600 font-medium">
                            WP ID #{r.wordpressPostId} sincronizado
                          </span>
                        )}
                        {r.error && (
                          <span className="text-amber-600 italic">
                            ({r.error})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setResult(null);
                  setErrorMsg(null);
                }}
              >
                Executar Novamente
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setResult(null);
                  onClose();
                }}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                Concluir
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
