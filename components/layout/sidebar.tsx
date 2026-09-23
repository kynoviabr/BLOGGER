"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  Calendar,
  FileText,
  Image as ImageIcon,
  ScrollText,
  Settings,
  Sparkles,
  ChevronRight,
  Layers,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { navigationItems } from "@/config/navigation";
import { logoutAction } from "@/app/actions/auth";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Globe,
  Calendar,
  Sparkles,
  FileText,
  Image: ImageIcon,
  ScrollText,
  Settings,
};

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6 dark:border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <span className="font-bold text-slate-900 dark:text-white tracking-tight text-base block">
              Content Factory
            </span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-blue-600 dark:text-blue-400">
              Foundation
            </span>
          </div>
        </div>

        {/* Navigation links */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          <div className="px-2 py-1.5 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">
            Navegação Principal
          </div>
          {navigationItems.map((item) => {
            const Icon = iconMap[item.icon] || Layers;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.title}</span>
                </div>
                {isActive && <ChevronRight className="h-4 w-4 opacity-70" />}
              </Link>
            );
          })}
        </div>

        {/* Footer info & Logout */}
        <div className="border-t border-slate-200 p-4 dark:border-slate-800 space-y-3">
          <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block">
              Content Factory
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              Private Workspace
            </span>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5 text-rose-500" />
              <span>Encerrar Sessão</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
