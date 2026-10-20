"use client";

import * as React from "react";
import { Menu, Globe, LogOut, Shield, Building2 } from "lucide-react";
import { BlogWithRelations } from "@/types/blog";
import { logoutAction } from "@/app/actions/auth";
import { OrganizationOption } from "@/types/organization";

interface TopbarProps {
  onMenuClick: () => void;
  blogs?: BlogWithRelations[];
  selectedBlogId?: string;
  onSelectBlog?: (blogId: string) => void;
  organizations?: OrganizationOption[];
  selectedOrganizationId?: string;
  onSelectOrganization?: (organizationId: string) => void;
  organizationPending?: boolean;
}

export function Topbar({ onMenuClick, blogs = [], selectedBlogId, onSelectBlog, organizations = [], selectedOrganizationId, onSelectOrganization, organizationPending }: TopbarProps) {
  const activeOrganization = organizations.find((organization) => organization.id === selectedOrganizationId);
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-xl sm:px-7 lg:px-10">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden" aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
        <div className="flex items-center gap-2">
          <div className="hidden h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-primary sm:flex"><Building2 className="h-4 w-4" /></div>
          <select
            aria-label="Empresa ativa"
            value={selectedOrganizationId || ""}
            disabled={organizationPending || organizations.length === 0}
            onChange={(event) => onSelectOrganization?.(event.target.value)}
            className="h-9 min-w-[150px] rounded-lg border border-input bg-card px-3 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 sm:text-sm"
          >
            {organizations.length === 0 ? <option value="">Nenhuma empresa</option> : organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
          <div className="hidden h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-primary sm:flex"><Globe className="h-4 w-4" /></div>
          <select value={selectedBlogId || "all"} onChange={(e) => onSelectBlog?.(e.target.value)} className="h-9 min-w-[190px] rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-ring sm:text-sm">
            {blogs.length === 0 ? <option value="">Nenhum blog cadastrado</option> : (
              <>
                <option value="all">Todos os Blogs</option>
                {blogs.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.default_language})</option>)}
              </>
            )}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground md:flex"><Shield className="h-3.5 w-3.5 text-primary" /><span>{activeOrganization?.role || "workspace"}</span></div>
        <form action={logoutAction}><button type="submit" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" title="Encerrar sessão"><LogOut className="h-4 w-4 text-destructive" /><span className="hidden sm:inline">Sair</span></button></form>
      </div>
    </header>
  );
}
