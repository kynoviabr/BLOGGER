"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Menu de seções da página de configuração do blog.
// Desktop: menu lateral fixo. Celular: menu suspenso que abre e fecha.
// Todas as seções ficam montadas (só escondidas) para não perder o que foi
// digitado ao trocar de seção.

export interface BlogSettingsSection {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  content: React.ReactNode;
}

interface BlogSettingsTabsProps {
  sections: BlogSettingsSection[];
}

export function BlogSettingsTabs({ sections }: BlogSettingsTabsProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const [menuOpen, setMenuOpen] = useState(false);

  // Mantém a seção aberta ao recarregar a página (#autopilot, #redes-sociais...).
  const sectionIds = sections.map((s) => s.id).join(",");
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (sectionIds.split(",").includes(fromHash)) setActiveId(fromHash);
  }, [sectionIds]);

  const select = (id: string) => {
    setActiveId(id);
    setMenuOpen(false);
    window.history.replaceState(null, "", `#${id}`);
  };

  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Menu suspenso (celular) */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          className="flex w-full items-center justify-between gap-3 rounded-brand-card border border-border bg-card p-3.5 text-left shadow-card"
        >
          <span className="flex items-center gap-2.5">
            <span className="text-primary">{active.icon}</span>
            <span className="text-sm font-semibold text-foreground">{active.label}</span>
          </span>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", menuOpen && "rotate-180")}
          />
        </button>
        {menuOpen && (
          <nav className="mt-2 overflow-hidden rounded-brand-card border border-border bg-card shadow-card">
            {sections.map((section) => (
              <MenuItem
                key={section.id}
                section={section}
                active={section.id === active.id}
                onSelect={select}
              />
            ))}
          </nav>
        )}
      </div>

      {/* Menu lateral (desktop) */}
      <nav
        aria-label="Seções de configuração"
        className="hidden w-64 shrink-0 space-y-1 lg:sticky lg:top-6 lg:block"
      >
        {sections.map((section) => (
          <MenuItem
            key={section.id}
            section={section}
            active={section.id === active.id}
            onSelect={select}
          />
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        {sections.map((section) => (
          <section
            key={section.id}
            id={`secao-${section.id}`}
            hidden={section.id !== active.id}
            aria-label={section.label}
          >
            {section.content}
          </section>
        ))}
      </div>
    </div>
  );
}

function MenuItem({
  section,
  active,
  onSelect,
}: {
  section: BlogSettingsSection;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(section.id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-brand-btn px-3 py-2.5 text-left text-sm transition-colors",
        active
          ? "bg-primary/10 font-semibold text-primary"
          : "text-muted-foreground hover:bg-[hsl(var(--bg-subtle))] hover:text-foreground"
      )}
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{section.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{section.label}</span>
        <span className="block truncate text-[11px] font-normal text-muted-foreground">
          {section.description}
        </span>
      </span>
      {section.badge}
    </button>
  );
}
