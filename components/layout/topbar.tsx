"use client";

import * as React from "react";
import { Menu, Globe, LogOut, Shield } from "lucide-react";
import { BlogWithRelations } from "@/types/blog";
import { logoutAction } from "@/app/actions/auth";

interface TopbarProps {
  onMenuClick: () => void;
  blogs?: BlogWithRelations[];
  selectedBlogId?: string;
  onSelectBlog?: (blogId: string) => void;
}

export function Topbar({
  onMenuClick,
  blogs = [],
  selectedBlogId,
  onSelectBlog,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-4 sm:px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Seletor de Blog Ativo */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            <Globe className="h-4 w-4" />
          </div>
          <select
            value={selectedBlogId || (blogs[0]?.id ?? "")}
            onChange={(e) => onSelectBlog?.(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {blogs.length === 0 ? (
              <option value="">Nenhum blog cadastrado</option>
            ) : (
              blogs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.default_language})
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          <Shield className="h-3.5 w-3.5 text-blue-600" />
          <span>Content Factory • Private Workspace</span>
        </div>

        {/* Botão de Logout Funcional */}
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
            title="Encerrar sessão"
          >
            <LogOut className="h-4 w-4 text-rose-500" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </form>
      </div>
    </header>
  );
}
