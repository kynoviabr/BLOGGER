"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BlogWithRelations } from "@/types/blog";
import { OrganizationOption } from "@/types/organization";
import { selectOrganizationAction } from "@/app/actions/organization";

interface AppShellProps {
  children: React.ReactNode;
  blogs?: BlogWithRelations[];
  initialBlogId?: string;
  organizations?: OrganizationOption[];
  initialOrganizationId?: string;
}

export function AppShell({ children, blogs = [], initialBlogId, organizations = [], initialOrganizationId }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [selectedOrganizationId, setSelectedOrganizationId] = React.useState(initialOrganizationId || "");
  const [organizationPending, startOrganizationTransition] = React.useTransition();

  // Inicializa o blog selecionado a partir do SSR cookie ou do primeiro blog
  const [selectedBlogId, setSelectedBlogId] = React.useState<string>(() =>
    initialBlogId && blogs.some((blog) => blog.id === initialBlogId) ? initialBlogId : "all"
  );

  // Sincroniza do cookie, localStorage ou query string após a montagem no cliente
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const urlBlog = new URLSearchParams(window.location.search).get("blogId");
      if (urlBlog && (urlBlog === "all" || blogs.some((blog) => blog.id === urlBlog))) {
        setSelectedBlogId(urlBlog);
        return;
      }
      const match = document.cookie.match(/(?:^|;\s*)selected_blog_id=([^;]+)/);
      if (match?.[1] && (match[1] === "all" || blogs.some((blog) => blog.id === match[1]))) {
        setSelectedBlogId(match[1]);
        return;
      }
      const stored = localStorage.getItem("selected_blog_id");
      if (stored && (stored === "all" || blogs.some((blog) => blog.id === stored))) {
        setSelectedBlogId(stored);
      } else {
        setSelectedBlogId("all");
      }
    }
  }, [pathname, blogs]);

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

  const handleSelectOrganization = (organizationId: string) => {
    if (!organizationId || organizationId === selectedOrganizationId) return;
    setSelectedOrganizationId(organizationId);
    setSelectedBlogId("all");
    try {
      localStorage.removeItem("selected_blog_id");
    } catch {}
    startOrganizationTransition(async () => {
      await selectOrganizationAction(organizationId);
      router.push(pathname);
      router.refresh();
    });
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
          organizations={organizations}
          selectedOrganizationId={selectedOrganizationId}
          onSelectOrganization={handleSelectOrganization}
          organizationPending={organizationPending}
        />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-5 py-7 sm:px-7 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
