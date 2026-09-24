import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { BlogService } from "@/services/blog.service";
import { getCurrentUser } from "@/lib/supabase/auth";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: `${siteConfig.name} — Painel Editorial`,
  description: siteConfig.description,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const blogs = user ? await BlogService.listBlogs().catch(() => []) : [];

  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full bg-background text-foreground antialiased">
        <AppShell blogs={blogs}>{children}</AppShell>
      </body>
    </html>
  );
}
