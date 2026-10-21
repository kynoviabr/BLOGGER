"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil, Tag, Trash2, AlertCircle, Inbox, PenLine } from "lucide-react";
import { BlogWithRelations } from "@/types/blog";
import { CalendarItemWithRelations } from "@/types/calendar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { discardIdeasAction, listPendingIdeasAction, prepareIdeasForGenerationAction } from "@/app/actions/calendar";
import { startArticleGeneration } from "@/lib/ideas/start-generation";

interface SavedIdeasListProps {
  blogs: BlogWithRelations[];
  initialBlogId?: string;
  onCountChange?: (count: number) => void;
}

export function SavedIdeasList({ blogs, initialBlogId, onCountChange }: SavedIdeasListProps) {
  const router = useRouter();
  const [selectedBlogId, setSelectedBlogId] = useState<string>(initialBlogId || blogs[0]?.id || "");
  const [ideas, setIdeas] = useState<CalendarItemWithRelations[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadIdeas = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await listPendingIdeasAction(selectedBlogId || undefined);
      setIdeas(items);
      setSelectedIds(new Set());
      onCountChange?.(items.length);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as ideias salvas.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedBlogId, onCountChange]);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === ideas.length ? new Set() : new Set(ideas.map((i) => i.id)));
  };

  const selectedInOrder = () => ideas.filter((i) => selectedIds.has(i.id)).map((i) => i.id);

  const handleGenerate = async () => {
    if (selectedIds.size === 0) return;
    setIsWorking(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const prepared = await prepareIdeasForGenerationAction(selectedInOrder());
      const { started, failed } = await startArticleGeneration(prepared);
      setSuccessMessage(
        `${started.length} artigo(s) sendo escritos. Eles aparecem em Content como "Em revisão" quando ficarem prontos.` +
          (failed.length ? ` ${failed.length} não puderam ser iniciados; tente de novo pelo Content.` : "")
      );
      await loadIdeas();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao gerar os artigos.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleDiscard = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Descartar ${selectedIds.size} ideia(s)? Essa ação não pode ser desfeita.`)) return;
    setIsWorking(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await discardIdeasAction(selectedInOrder());
      setSuccessMessage(`${result.count} ideia(s) descartada(s).`);
      await loadIdeas();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao descartar as ideias.");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Blog</label>
            <Select
              value={selectedBlogId}
              onChange={(e) => setSelectedBlogId(e.target.value)}
              disabled={isWorking}
            >
              {blogs.map((blog) => (
                <option key={blog.id} value={blog.id}>
                  {blog.name}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-muted-foreground self-end sm:col-span-2">
            Ideias que você guardou para depois. Ao gerar, o artigo vai para Content para revisão. Nada entra no
            Calendário até você agendar o artigo.
          </p>
        </div>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          {successMessage}
        </div>
      )}

      {isLoading ? (
        <Card className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando ideias...
        </Card>
      ) : ideas.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <Inbox className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nenhuma ideia salva.</p>
          <p className="text-xs text-muted-foreground">
            Use &ldquo;Salvar para depois&rdquo; nas outras abas para guardar ideias aqui.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="saved-select-all"
                checked={selectedIds.size === ideas.length}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
              />
              <label htmlFor="saved-select-all" className="text-sm font-semibold text-foreground cursor-pointer">
                Selecionar todas ({selectedIds.size} de {ideas.length})
              </label>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={handleDiscard}
                disabled={isWorking || selectedIds.size === 0}
                className="gap-2 flex-1 sm:flex-none"
              >
                <Trash2 className="h-4 w-4" />
                Descartar
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={isWorking || selectedIds.size === 0}
                className="gap-2 bg-success hover:brightness-95 text-white flex-1 sm:flex-none"
              >
                {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                Gerar artigos ({selectedIds.size})
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {ideas.map((idea) => {
              const isSelected = selectedIds.has(idea.id);
              return (
                <Card
                  key={idea.id}
                  onClick={() => toggleSelect(idea.id)}
                  className={`p-5 transition-all cursor-pointer border ${
                    isSelected ? "border-primary bg-[hsl(var(--primary-light))] shadow-card" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(idea.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-base font-semibold text-foreground">
                          {idea.proposed_title || idea.topic}
                        </h4>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {idea.category?.name && (
                            <Badge variant="outline" className="text-xs">
                              {idea.category.name}
                            </Badge>
                          )}
                          {idea.article_type && (
                            <Badge variant="info" className="text-xs">
                              {idea.article_type}
                            </Badge>
                          )}
                          <Link
                            href={`/calendar/${idea.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <Pencil className="h-3 w-3" />
                            Editar
                          </Link>
                        </div>
                      </div>
                      {idea.notes && (
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{idea.notes}</p>
                      )}
                      {idea.keywords && idea.keywords.length > 0 && (
                        <div className="flex items-center gap-2 pt-1">
                          <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground font-mono">{idea.keywords.join(", ")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
