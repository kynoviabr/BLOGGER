"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { 
  Plus, 
  ExternalLink, 
  Edit3, 
  Trash2, 
  Power, 
  Tag, 
  Globe, 
  BadgeCheck, 
  Star,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
} from "lucide-react";
import { MonetizationOffer, OFFER_TYPE_LABELS } from "@/types/monetization";
import { BlogWithRelations } from "@/types/blog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toggleOfferStatusAction, deleteOfferAction } from "@/app/actions/monetization";
import { BackfillModal } from "./backfill-modal";

interface OffersListProps {
  initialOffers: MonetizationOffer[];
  blogs: BlogWithRelations[];
  defaultBlogId?: string;
}

export function OffersList({ initialOffers, blogs, defaultBlogId }: OffersListProps) {
  const [selectedBlogFilter, setSelectedBlogFilter] = useState<string>(defaultBlogId || "all");
  const [offers, setOffers] = useState<MonetizationOffer[]>(initialOffers);
  const [isPending, startTransition] = useTransition();
  const [isBackfillOpen, setIsBackfillOpen] = useState<boolean>(false);

  React.useEffect(() => {
    setOffers(initialOffers);
  }, [initialOffers]);

  React.useEffect(() => {
    if (defaultBlogId) {
      setSelectedBlogFilter(defaultBlogId);
    } else {
      setSelectedBlogFilter("all");
    }
  }, [defaultBlogId]);

  const filteredOffers = offers.filter((offer) => {
    if (selectedBlogFilter === "all") return true;
    return offer.blog_id === selectedBlogFilter;
  });

  const handleToggle = (id: string) => {
    startTransition(async () => {
      try {
        await toggleOfferStatusAction(id);
        setOffers((prev) =>
          prev.map((o) => (o.id === id ? { ...o, is_active: !o.is_active } : o))
        );
      } catch (err) {
        console.error("Falha ao alternar status da oferta", err);
      }
    });
  };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Deseja realmente excluir a oferta "${title}"?`)) return;

    startTransition(async () => {
      try {
        await deleteOfferAction(id);
        setOffers((prev) => prev.filter((o) => o.id !== id));
      } catch (err) {
        console.error("Falha ao excluir oferta", err);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-muted-foreground">Filtrar por Blog:</label>
          <select
            value={selectedBlogFilter}
            onChange={(e) => setSelectedBlogFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">Todos os Blogs ({offers.length} ofertas)</option>
            {blogs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBackfillOpen(true)}
            className="gap-1.5 border-teal-500/40 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30"
          >
            <Zap className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Retroalimentar Artigos Publicados
          </Button>

          <Link href="/monetization/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nova Oferta
            </Button>
          </Link>
        </div>
      </div>

      {filteredOffers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="rounded-full bg-primary/10 p-4 text-primary mb-3">
              <BadgeCheck className="h-8 w-8" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              Nenhuma oferta cadastrada
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Cadastre ofertas de produtos próprios (e-books, cursos) ou links de afiliados vinculados às categorias do seu blog.
            </p>
            <Link href="/monetization/new" className="mt-4">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Cadastrar Primeira Oferta
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredOffers.map((offer) => {
            const blog = blogs.find((b) => b.id === offer.blog_id);
            const isOwnProduct = offer.offer_type === "OWN_PRODUCT";

            return (
              <Card
                key={offer.id}
                className={`transition-shadow hover:shadow-md ${
                  !offer.is_active ? "opacity-60 bg-slate-50/50 dark:bg-slate-900/30" : ""
                } ${isOwnProduct ? "border-teal-500/30 dark:border-teal-500/20" : ""}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={isOwnProduct ? "success" : "info"}
                          className="text-[10px] font-bold"
                        >
                          {offer.offer_type === "OWN_PRODUCT"
                            ? "⭐ PRODUTO PRÓPRIO"
                            : OFFER_TYPE_LABELS[offer.offer_type]}
                        </Badge>

                        {offer.badge_text && (
                          <Badge variant="outline" className="text-[10px]">
                            {offer.badge_text}
                          </Badge>
                        )}

                        {offer.is_global_fallback && (
                          <Badge variant="warning" className="text-[10px]">
                            Fallback Global
                          </Badge>
                        )}
                      </div>

                      <CardTitle className="text-base font-semibold leading-tight pt-1">
                        {offer.title}
                      </CardTitle>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span>Blog:</span>
                        <strong className="text-foreground">{blog?.name || "Blog Geral"}</strong>
                        <span className="text-[11px] font-mono">({blog?.domain})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggle(offer.id)}
                        disabled={isPending}
                        title={offer.is_active ? "Pausar Oferta" : "Ativar Oferta"}
                        className={`rounded-md p-1.5 transition-colors ${
                          offer.is_active
                            ? "text-success hover:bg-success/10"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {offer.pitch_hook}
                  </p>

                  {/* Metadados da Oferta */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Tag className="h-3 w-3 text-primary" />
                      <span>Categorias:</span>
                      {offer.category_ids && offer.category_ids.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {offer.category_ids.map((c) => (
                            <span
                              key={c}
                              className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="italic">Nenhuma categoria específica</span>
                      )}
                    </div>

                    <div className="ml-auto flex items-center gap-1 font-medium">
                      <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                      <span>Prioridade: {offer.priority}/10</span>
                    </div>
                  </div>

                  {/* Ações da Oferta */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <a
                      href={offer.affiliate_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {offer.cta_button_text}
                    </a>

                    <div className="flex items-center gap-2">
                      <Link href={`/monetization/${offer.id}`}>
                        <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs gap-1">
                          <Edit3 className="h-3 w-3" />
                          Editar
                        </Button>
                      </Link>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(offer.id, offer.title)}
                        disabled={isPending}
                        className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Retroalimentação (Backfill) */}
      <BackfillModal
        isOpen={isBackfillOpen}
        onClose={() => setIsBackfillOpen(false)}
        blogs={blogs}
        defaultBlogId={
          selectedBlogFilter !== "all"
            ? selectedBlogFilter
            : initialOffers[0]?.blog_id || blogs[0]?.id
        }
      />
    </div>
  );
}
