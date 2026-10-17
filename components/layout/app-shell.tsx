"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BlogWithRelations } from "@/types/blog";

interface AppShellProps {
  children: React.ReactNode;
  blogs?: BlogWithRelations[];
  initialBlogId?: string;
}

export function AppShell({ children, blogs = [], initialBlogId }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // Inicializa o blog selecionado a partir do SSR cookie ou do primeiro blog
  const [selectedBlogId, setSelectedBlogId] = React.useState<string>(
    initialBlogId !== undefined ? initialBlogId : (blogs[0]?.id || "all")
  );

  // Sincroniza do cookie, localStorage ou query string após a montagem no cliente
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const urlBlog = new URLSearchParams(window.location.search).get("blogId");
      if (urlBlog) {
        setSelectedBlogId(urlBlog);
        return;
      }
      const match = document.cookie.match(/(?:^|;\s*)selected_blog_id=([^;]+)/);
      if (match?.[1]) {
        setSelectedBlogId(match[1]);
        return;
      }
      const stored = localStorage.getItem("selected_blog_id");
      if (stored) {
        setSelectedBlogId(stored);
      }
    }
  }, [pathname]);

  const handleSelectBlog = (newBlogId: string) => {
    setSelectedBlogId(newBlogId);

    // Salva cookie e localStorage
    if (typeof document !== "undefined") {
      document.cookie = `selected_blog_id=${newBlogId}; path=/; max-age=31536000; SameSite=Lax`;
      try {
        localStorage.setItem("selected_blog_id", newBlogId);
      } catch {}
    }

    // Atualiza a query string da rota atual e sincroniza imediatamente os dados da página
    const currentSearch = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(currentSearch);
    if (newBlogId && newBlogId !== "all") {
      params.set("blogId", newBlogId);
    } else {
      params.delete("blogId");
    }
    const newQuery = params.toString();
    router.push(`${pathname}${newQuery ? `?${newQuery}` : ""}`);
    router.refresh();
  };

  if (pathname === "/login") return <div className="min-h-screen bg-background text-foreground">{children}</div>;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} selectedBlogId={selectedBlogId} />
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          blogs={blogs}
          selectedBlogId={selectedBlogId}
          onSelectBlog={handleSelectBlog}
        />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-5 py-7 sm:px-7 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
