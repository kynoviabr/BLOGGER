import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { BlogService } from "@/services/blog.service";
import { getCurrentUser } from "@/lib/supabase/auth";
import { OrganizationService } from "@/services/organization.service";
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
  const organizations = user ? await OrganizationService.listOrganizations().catch(() => []) : [];
  const cookieStore = await cookies();
  const cookieOrganizationId = cookieStore.get("selected_organization_id")?.value;
  const activeOrganization = organizations.find((organization) => organization.id === cookieOrganizationId) || organizations[0];
  const blogs = user && activeOrganization
    ? await BlogService.listBlogs(activeOrganization.id).catch(() => [])
    : [];
  const cookieBlogId = cookieStore.get("selected_blog_id")?.value;

  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full bg-background text-foreground antialiased">
        <AppShell
          blogs={blogs}
          initialBlogId={cookieBlogId}
          organizations={organizations}
          initialOrganizationId={activeOrganization?.id}
        >{children}</AppShell>
      </body>
    </html>
  );
}
