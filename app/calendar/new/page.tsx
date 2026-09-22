import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BlogService } from "@/services/blog.service";
import { CalendarItemForm } from "@/components/calendar/calendar-item-form";

export default async function NewCalendarItemPage() {
  const blogs = await BlogService.listBlogs().catch(() => []);

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/calendar"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para o Calendário
      </Link>

      <PageHeader
        title="Cadastrar Nova Pauta"
        description="Defina o tema, títulos pretendidos, data e hora agendada. Posteriormente a Content Factory pesquisará e gerará o artigo automaticamente."
      />

      <Card>
        <CardHeader>
          <CardTitle>Planejamento Editorial</CardTitle>
          <CardDescription>
            Insira os dados essenciais para o fluxo automatizado de produção.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CalendarItemForm blogs={blogs} />
        </CardContent>
      </Card>
    </div>
  );
}
