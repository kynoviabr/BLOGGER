"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BlogWithRelations } from "@/types/blog";

interface AppShellProps {
  children: React.ReactNode;
  blogs?: BlogWithRelations[];
}

export function AppShell({ children, blogs = [] }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [selectedBlogId, setSelectedBlogId] = React.useState<string>(blogs[0]?.id || "");

  React.useEffect(() => {
    if (blogs.length > 0 && !selectedBlogId) {
      setSelectedBlogId(blogs[0].id);
    }
  }, [blogs, selectedBlogId]);

  // Se for a página de login, não renderiza o shell administrativo
  if (pathname === "/login") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          blogs={blogs}
          selectedBlogId={selectedBlogId}
          onSelectBlog={setSelectedBlogId}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
