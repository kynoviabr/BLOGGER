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
  defaultCategories: { id: string; name: string }[];
}

export function IdeasGeneratorView({ blogs, defaultCategories }: IdeasGeneratorViewProps) {
  const router = useRouter();

  const [selectedBlogId, setSelectedBlogId] = useState<string>(blogs[0]?.id || "");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [count, setCount] = useState<number>(7);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [generatedIdeas, setGeneratedIdeas] = useState<ContentIdea[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Categorias disponíveis a partir dos blogs ou padrão
  const currentBlog = blogs.find((b) => b.id === selectedBlogId);
  const categoriesToDisplay =
    currentBlog && currentBlog.categories && currentBlog.categories.length > 0
      ? currentBlog.categories
      : defaultCategories;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlogId) {
      setError("Por favor, selecione um blog.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setGeneratedIdeas([]);
    setSelectedIndices(new Set());

    try {
      const response = await fetch("/api/content/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blogId: selectedBlogId,
          category: selectedCategory || undefined,
          count,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Falha ao gerar ideias.");
      }

      setGeneratedIdeas(data.ideas || []);
      // Seleciona todas as ideias por padrão para facilitar o fluxo
      const allIndices = new Set<number>((data.ideas || []).map((_: unknown, i: number) => i));
      setSelectedIndices(allIndices);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ocorreu um erro ao gerar ideias.";
      setError(msg);
    } finally {
      setIsLoading(false);
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

      const data = await response.json();

      if (!response.ok || !data.success) {
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
                onChange={(e) => setSelectedBlogId(e.target.value)}
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
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Skeleton de Carregamento */}
      {isLoading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-9 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-5">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-5 w-5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="flex gap-2">
                    <div className="h-6 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-6 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Lista de Ideias Geradas */}
      {!isLoading && generatedIdeas.length > 0 && (
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
