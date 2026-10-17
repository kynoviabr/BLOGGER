"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Globe, Calendar, FileText, Image as ImageIcon, ScrollText, Settings, Sparkles, ChevronRight, Layers, LogOut, BadgeDollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigationItems } from "@/config/navigation";
import { logoutAction } from "@/app/actions/auth";

const iconMap: Record<string, React.ElementType> = { LayoutDashboard, Globe, Calendar, Sparkles, FileText, Image: ImageIcon, BadgeDollarSign, ScrollText, Settings };
interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
  selectedBlogId?: string;
}

export function Sidebar({ isOpen, onClose, selectedBlogId }: SidebarProps) {
  const pathname = usePathname();
  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-foreground/35 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] transition-transform duration-200 lg:static lg:translate-x-0", isOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-20 items-center gap-3 border-b border-[hsl(var(--sidebar-border))] px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary text-white shadow-glow"><Sparkles className="h-5 w-5" /></div>
          <div><span className="block text-base font-semibold tracking-tight text-white">Content Factory</span><span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--sidebar-primary))]">Editorial OS</span></div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Workspace</div>
          {navigationItems.map((item) => {
            const Icon = iconMap[item.icon] || Layers;
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const targetHref = selectedBlogId && selectedBlogId !== "all"
              ? `${item.href}${item.href.includes("?") ? "&" : "?"}blogId=${selectedBlogId}`
              : item.href;

            return (
              <Link
                key={item.href}
                href={targetHref}
                onClick={onClose}
                className={cn(
                  "group flex h-10 items-center justify-between rounded-lg px-3 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[hsl(var(--sidebar-primary))] text-white shadow-glow"
                    : "text-white/65 hover:bg-[hsl(var(--sidebar-accent))] hover:text-white"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.title}</span>
                </div>
                {isActive && <ChevronRight className="h-4 w-4" />}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-[hsl(var(--sidebar-border))] p-4">
          <div className="rounded-lg border border-[hsl(var(--sidebar-border))] bg-white/5 p-3"><span className="block text-xs font-semibold text-white">Content Factory</span><span className="block text-[11px] text-white/50">Private Workspace</span></div>
          <form action={logoutAction}><button type="submit" className="flex h-9 w-full items-center justify-center gap-2 rounded-lg text-xs font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white"><LogOut className="h-3.5 w-3.5" />Encerrar Sessão</button></form>
        </div>
      </aside>
    </>
  );
}
