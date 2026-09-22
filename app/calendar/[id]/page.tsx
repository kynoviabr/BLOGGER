import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { CalendarService } from "@/services/calendar.service";
import { CalendarItemEditForm } from "@/components/calendar/calendar-item-edit-form";

export default async function CalendarItemDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await CalendarService.getCalendarItemById(id).catch(() => null);

  if (!item) {
    notFound();
  }

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
        title="Editar Pauta Editorial"
        description={`Item associado ao blog ${item.blog?.name || "Blog"}.`}
        actions={<StatusBadge status={item.status} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Detalhes da Pauta</CardTitle>
          <CardDescription>
            Ajuste o tópico, títulos, prioridade e agendamento de publicação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CalendarItemEditForm item={item} />
        </CardContent>
      </Card>
    </div>
  );
}
