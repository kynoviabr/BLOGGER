import { cookies } from "next/headers";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CalendarService } from "@/services/calendar.service";
import { CategoryService } from "@/services/category.service";
import { CalendarStatus, CalendarItemWithRelations } from "@/types/calendar";
import { Category } from "@/types/blog";
import { EmptyState } from "@/components/shared/empty-state";
import { CalendarViewContainer } from "@/components/calendar/calendar-view-container";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ blogId?: string; status?: CalendarStatus; view?: "month" | "table" }>;
}) {
  const { blogId: queryBlogId, status, view } = await searchParams;
  const cookieStore = await cookies();
  const cookieBlogId = cookieStore.get("selected_blog_id")?.value;

  const rawBlogId = queryBlogId !== undefined ? queryBlogId : cookieBlogId;
  const blogId = rawBlogId && rawBlogId !== "all" ? rawBlogId : undefined;

  let items: CalendarItemWithRelations[] = [];
  let categories: Category[] = [];
  let loadError: string | null = null;

  try {
    const [fetchedItems, fetchedCategories] = await Promise.all([
      CalendarService.listCalendarItems({ blogId, status }),
      blogId ? CategoryService.listCategoriesByBlog(blogId).catch(() => []) : Promise.resolve([]),
    ]);
    // Pautas ainda não aprovadas (IDEA) ficam no Ideation Engine, fora do calendário.
    items = status ? fetchedItems : fetchedItems.filter((item) => item.status !== "IDEA");
    categories = fetchedCategories;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Não foi possível carregar o calendário.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendário & Planejamento Editorial"
        description="Visualize a grade de publicações, configure a cadência multi-categoria e acompanhe a publicação automática nativa pelo Supabase."
      />

      {loadError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-[hsl(var(--danger-bg))] p-4 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Erro ao consultar pautas no Supabase:</span>
            {loadError}
          </div>
        </div>
      )}

      {items.length === 0 && !loadError ? (
        <EmptyState
          title="Nenhuma pauta encontrada"
          description={
            blogId
              ? "Nenhuma pauta cadastrada para este blog com o filtro selecionado."
              : "Cadastre temas ou gere ideias com IA para iniciar o planejamento editorial."
          }
          actionLabel="Cadastrar Pauta"
        />
      ) : (
        <CalendarViewContainer
          initialItems={items}
          categories={categories}
          blogId={blogId}
          initialStatus={status}
          initialView={view || "month"}
        />
      )}
    </div>
  );
}
