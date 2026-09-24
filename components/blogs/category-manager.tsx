"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { FolderTree, Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Category } from "@/types/blog";
import { createCategoryAction, deleteCategoryAction } from "@/app/actions/category";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface CategoryManagerProps {
  blogId: string;
  categories: Category[];
}

export function CategoryManager({ blogId, categories: initialCategories }: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Atualiza estado local quando as props mudarem
  React.useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setError(null);
    const formData = new FormData();
    formData.append("blog_id", blogId);
    formData.append("name", name.trim());
    if (slug.trim()) formData.append("slug", slug.trim());
    if (description.trim()) formData.append("description", description.trim());

    startTransition(async () => {
      const result = await createCategoryAction(null, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setName("");
        setSlug("");
        setDescription("");
        setShowAddForm(false);
        // O revalidatePath cuidará da atualização via servidor
      }
    });
  };

  const handleDelete = async (categoryId: string, categoryName: string) => {
    if (!confirm(`Tem certeza que deseja remover a categoria "${categoryName}"?`)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await deleteCategoryAction(categoryId, blogId);
      if (result.error) {
        setError(result.error);
      } else {
        setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      }
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-blue-600" />
          Categorias ({categories.length})
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
          className="h-8 gap-1 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova Categoria
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="flex items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {showAddForm && (
          <form onSubmit={handleCreate} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40 space-y-2 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-300">
              Cadastrar Nova Categoria
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Nome da Categoria *
              </label>
              <Input
                placeholder="Ex: Cartões de Crédito"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
                required
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Slug (Opcional)
              </label>
              <Input
                placeholder="Ex: cartoes-de-credito"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={isPending}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                Descrição (Opcional)
              </label>
              <Input
                placeholder="Ex: Análises, limites e benefícios..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isPending}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(false)}
                disabled={isPending}
                className="h-7 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending || !name.trim()}
                className="h-7 text-xs gap-1"
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Salvar Categoria
              </Button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {categories.length > 0 ? (
            categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40 text-xs group"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {cat.name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    /{cat.slug}
                  </span>
                  {cat.description && (
                    <span className="text-[11px] text-slate-400 truncate mt-0.5">
                      {cat.description}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(cat.id, cat.name)}
                  disabled={isPending}
                  title="Remover categoria"
                  className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors shrink-0 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 py-1">Nenhuma categoria cadastrada para este blog.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
