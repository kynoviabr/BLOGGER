"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Globe, Calendar, FileText, Image as ImageIcon, ScrollText, Settings, Sparkles, ChevronRight, Layers, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigationItems } from "@/config/navigation";
import { logoutAction } from "@/app/actions/auth";

const iconMap: Record<string, React.ElementType> = { LayoutDashboard, Globe, Calendar, Sparkles, FileText, Image: ImageIcon, ScrollText, Settings };
interface SidebarProps { isOpen: boolean; onClose?: () => void; }

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-foreground/35 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card transition-transform duration-200 lg:static lg:translate-x-0", isOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-20 items-center gap-3 border-b border-border px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Sparkles className="h-5 w-5" /></div>
          <div><span className="block text-base font-semibold tracking-tight text-foreground">Content Factory</span><span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Editorial OS</span></div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workspace</div>
          {navigationItems.map((item) => {
            const Icon = iconMap[item.icon] || Layers;
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} onClick={onClose} className={cn("group flex h-10 items-center justify-between rounded-lg px-3 text-sm font-medium transition-colors", isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>
              <div className="flex items-center gap-3"><Icon className="h-4 w-4 shrink-0" /><span>{item.title}</span></div>{isActive && <ChevronRight className="h-4 w-4" />}
            </Link>;
          })}
        </nav>
        <div className="space-y-3 border-t border-border p-4">
          <div className="rounded-lg border border-border bg-muted/60 p-3"><span className="block text-xs font-semibold text-foreground">Content Factory</span><span className="block text-[11px] text-muted-foreground">Private Workspace</span></div>
          <form action={logoutAction}><button type="submit" className="flex h-9 w-full items-center justify-center gap-2 rounded-lg text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><LogOut className="h-3.5 w-3.5" />Encerrar Sessão</button></form>
        </div>
      </aside>
    </>
  );
}
