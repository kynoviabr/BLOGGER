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
  // Se o usuário estiver autenticado, carrega a lista de blogs para o AppShell.
  // Se não estiver autenticado (ex: na tela de /login), passa array vazio sem disparar query protegida.
  const user = await getCurrentUser();
  const blogs = user ? await BlogService.listBlogs().catch(() => []) : [];

  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full antialiased selection:bg-blue-500 selection:text-white">
        <AppShell blogs={blogs}>{children}</AppShell>
      </body>
    </html>
  );
}
