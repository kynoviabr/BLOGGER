"use client";

import * as React from "react";
import { useState } from "react";
import { Sparkles, Edit3, Bookmark } from "lucide-react";
import { BlogWithRelations } from "@/types/blog";
import { IdeasGeneratorView } from "@/components/ideas/ideas-generator-view";
import { ManualPautaIngest } from "@/components/ideas/manual-pauta-ingest";
import { SavedIdeasList } from "@/components/ideas/saved-ideas-list";
import { cn } from "@/lib/utils";

interface IdeasTabsContainerProps {
  blogs: BlogWithRelations[];
  initialBlogId?: string;
  initialTab?: IdeasTab;
}

export type IdeasTab = "auto" | "manual" | "saved";

export function IdeasTabsContainer({ blogs, initialBlogId, initialTab = "manual" }: IdeasTabsContainerProps) {
  const [activeTab, setActiveTab] = useState<IdeasTab>(initialTab);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      {/* Seletor de Abas */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors",
            activeTab === "manual"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Edit3 className="h-4 w-4" />
          Colar Pauta Manual & Aprimorar com IA
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("auto")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors",
            activeTab === "auto"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Sparkles className="h-4 w-4" />
          Gerador Automático de Ideias em Lote
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("saved")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors",
            activeTab === "saved"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Bookmark className="h-4 w-4" />
          Ideias salvas{pendingCount ? ` (${pendingCount})` : ""}
        </button>
      </div>

      {/* Conteúdo da Aba */}
      {activeTab === "manual" && (
        <ManualPautaIngest blogs={blogs} initialBlogId={initialBlogId} />
      )}
      {activeTab === "auto" && <IdeasGeneratorView blogs={blogs} initialBlogId={initialBlogId} />}
      {activeTab === "saved" && (
        <SavedIdeasList blogs={blogs} initialBlogId={initialBlogId} onCountChange={setPendingCount} />
      )}
    </div>
  );
}
