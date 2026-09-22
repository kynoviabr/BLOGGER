import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ContentService } from "@/services/content.service";
import { ContentEditForm } from "@/components/content/content-edit-form";

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = await ContentService.getContentById(id).catch(() => null);

  if (!content) {
    notFound();
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <Link
        href="/content"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para Artigos
      </Link>

      <PageHeader
        title={content.title}
        description={`Blog: ${content.blog?.name || "Blog"} • Idioma: ${content.language}`}
        actions={<StatusBadge status={content.status} />}
      />

      <ContentEditForm content={content} />
    </div>
  );
}
