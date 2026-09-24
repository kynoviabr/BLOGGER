"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BlogWithRelations } from "@/types/blog";

interface AppShellProps { children: React.ReactNode; blogs?: BlogWithRelations[]; }

export function AppShell({ children, blogs = [] }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [selectedBlogId, setSelectedBlogId] = React.useState<string>(blogs[0]?.id || "");

  React.useEffect(() => {
    if (blogs.length > 0 && !selectedBlogId) setSelectedBlogId(blogs[0].id);
  }, [blogs, selectedBlogId]);

  if (pathname === "/login") return <div className="min-h-screen bg-background text-foreground">{children}</div>;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} blogs={blogs} selectedBlogId={selectedBlogId} onSelectBlog={setSelectedBlogId} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-5 py-7 sm:px-7 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
