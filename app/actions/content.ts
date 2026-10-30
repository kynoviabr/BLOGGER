"use server";

import { revalidatePath } from "next/cache";
import { ContentService } from "@/services/content.service";
import { ContentItemUpdate, ContentStatus } from "@/types/content";
import { requireAuth } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateContentSchema } from "@/lib/validations/content.schema";
import { logger } from "@/lib/logger";
import { buildAutoSchedulePlan } from "@/lib/auto-schedule/plan";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

export interface ContentFormData {
  title: string;
  slug: string;
  excerpt?: string | null;
  body: string;
  status: ContentStatus;
  seo_title?: string | null;
  meta_description?: string | null;
  focus_keyword?: string | null;
  tags?: string[];
}

export async function updateContentAction(
  id: string,
  prevState: ActionResult | null,
  data: FormData | ContentFormData
): Promise<ActionResult> {
  try {
    // 1. Autorização estrita
    await requireAuth();

    // 2. Validação com Zod
    const rawInput = data instanceof FormData
      ? {
          title: data.get("title"),
          slug: data.get("slug"),
          excerpt: data.get("excerpt") || null,
          body: data.get("body") || "",
          status: data.get("status"),
          seo_title: data.get("seo_title") || null,
          meta_description: data.get("meta_description") || null,
          focus_keyword: data.get("focus_keyword") || null,
          tags: data.get("tags") ? String(data.get("tags")).split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        }
      : {
          ...data,
          tags: data.tags ?? undefined,
        };

    const validation = updateContentSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0]?.message || "Dados do artigo inválidos." };
    }

    const updates: ContentItemUpdate = {
      ...validation.data,
      tags: validation.data.tags ?? undefined,
    };

    // 2.1 Verificação amigável de duplicidade de slug no mesmo blog
    const supabase = await getSupabaseServerClient();
    const { data: currentItem } = await supabase
      .from('content_items')
      .select('blog_id')
      .eq('id', id)
      .maybeSingle();

    if (currentItem && validation.data.slug) {
      const { data: conflict } = await supabase
        .from('content_items')
        .select('id, title')
        .eq('blog_id', currentItem.blog_id)
        .eq('slug', validation.data.slug)
        .neq('id', id)
        .maybeSingle();

      if (conflict) {
        return {
          success: false,
          error: `O slug "${validation.data.slug}" já está em uso pelo artigo "${conflict.title}". Escolha outro slug para salvar.`,
        };
      }
    }

    // 3. Persistência real
    await ContentService.updateContent(id, updates);

    revalidatePath("/content");
    revalidatePath(`/content/${id}`);

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível salvar o artigo. Verifique a conexão com o banco e tente novamente.";
    logger.error("ContentAction.update", `Erro ao salvar artigo ${id}`, { err });
    return { success: false, error: message };
  }
}

/**
 * Agenda um artigo revisado: ele entra no Calendário Editorial na data escolhida
 * e o publicador do Supabase o envia ao WordPress quando a data chegar.
 */
export async function scheduleContentAction(
  id: string,
  scheduledAt: string
): Promise<ActionResult & { scheduledAt?: string }> {
  try {
    await requireAuth();
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) return { success: false, error: "Data de agendamento inválida." };
    if (when.getTime() <= Date.now()) {
      return { success: false, error: "Escolha uma data futura, ou use \"Publicar agora\"." };
    }

    const supabase = await getSupabaseServerClient();
    const { data: item, error: itemError } = await supabase
      .from("content_items")
      .select("id, blog_id, title, body, language, status, editorial_calendar_id, publish_attempts, featured_image_id")
      .eq("id", id)
      .maybeSingle();
    if (itemError || !item) return { success: false, error: "Artigo não encontrado." };
    if (item.status === "published") return { success: false, error: "Este artigo já foi publicado." };
    if (!item.body || item.body.trim().length === 0) {
      return { success: false, error: "O artigo precisa ter texto antes de ser agendado." };
    }

    const iso = when.toISOString();
    let calendarId = item.editorial_calendar_id;
    if (calendarId) {
      const { error } = await supabase
        .from("editorial_calendar")
        .update({ scheduled_at: iso, status: "SCHEDULED", updated_at: new Date().toISOString() })
        .eq("id", calendarId);
      if (error) throw new Error(`Falha ao agendar no calendário: ${error.message}`);
    } else {
      const { data: created, error } = await supabase
        .from("editorial_calendar")
        .insert({
          blog_id: item.blog_id,
          topic: item.title,
          proposed_title: item.title,
          language: item.language || "pt-BR",
          scheduled_at: iso,
          status: "SCHEDULED",
        })
        .select("id")
        .single();
      if (error || !created) throw new Error(`Falha ao criar a entrada no calendário: ${error?.message}`);
      calendarId = created.id;
    }

    const { error: contentError } = await supabase
      .from("content_items")
      .update({ status: "scheduled", editorial_calendar_id: calendarId, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (contentError) throw new Error(`Falha ao atualizar o artigo: ${contentError.message}`);

    // Artigos criados à mão não passam pelo pipeline, que gera a imagem sozinho.
    // Se o artigo não tem imagem de destaque, enfileira a geração antes da publicação.
    // Uma falha aqui não impede o agendamento; o botão "Gerar Imagem de Destaque" continua disponível.
    if (!item.featured_image_id) {
      await supabase.rpc("enqueue_background_job", {
        p_job_type: "image_generation",
        p_payload: { contentId: id, requestedBy: "schedule" },
        p_blog_id: item.blog_id,
        p_idempotency_key: `image-generation:schedule:${id}`,
        p_priority: 100,
        p_max_attempts: 3,
      } as never);
    }

    // O gatilho do banco só cria o job de publicação quando o status muda e
    // reaproveita a mesma chave; ao reagendar, o job antigo manteria a data
    // antiga. Um job com chave própria para esta data garante a publicação.
    const { error: jobError } = await supabase.rpc("enqueue_background_job", {
      p_job_type: "publish_content",
      p_payload: { contentId: id },
      p_blog_id: item.blog_id,
      p_idempotency_key: `publish:${id}:${item.publish_attempts ?? 0}:${iso}`,
      p_scheduled_at: iso,
      p_priority: 100,
      p_max_attempts: 5,
    } as never);
    if (jobError) throw new Error(`Artigo agendado, mas a publicação não foi enfileirada: ${jobError.message}`);

    revalidatePath("/content");
    revalidatePath(`/content/${id}`);
    revalidatePath("/calendar");
    return { success: true, scheduledAt: iso };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível agendar o artigo.";
    logger.error("ContentAction.schedule", `Erro ao agendar artigo ${id}`, { err });
    return { success: false, error: message };
  }
}

/** Cancela o agendamento: o artigo volta para revisão e sai do calendário. */
export async function unscheduleContentAction(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const supabase = await getSupabaseServerClient();
    const { data: item } = await supabase
      .from("content_items")
      .select("id, status, editorial_calendar_id")
      .eq("id", id)
      .maybeSingle();
    if (!item) return { success: false, error: "Artigo não encontrado." };
    if (item.status === "published" || item.status === "publishing") {
      return { success: false, error: "Este artigo já está sendo publicado ou foi publicado." };
    }

    if (item.editorial_calendar_id) {
      // IN_PROGRESS (e não PLANNED) para o piloto automático não reescrever o artigo.
      await supabase
        .from("editorial_calendar")
        .update({ scheduled_at: null, status: "IN_PROGRESS", updated_at: new Date().toISOString() })
        .eq("id", item.editorial_calendar_id)
        .neq("status", "PUBLISHED");
    }
    await supabase
      .from("content_items")
      .update({ status: "reviewing", updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["scheduled", "ready"]);

    revalidatePath("/content");
    revalidatePath(`/content/${id}`);
    revalidatePath("/calendar");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível cancelar o agendamento.";
    logger.error("ContentAction.unschedule", `Erro ao cancelar agendamento ${id}`, { err });
    return { success: false, error: message };
  }
}

/** Arquiva rascunhos (só os que ainda estão em rascunho). Reversível pelo status do artigo. */
export async function archiveDraftsAction(ids: string[]): Promise<ActionResult & { count?: number }> {
  try {
    await requireAuth();
    if (!Array.isArray(ids) || ids.length === 0) return { success: true, count: 0 };
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("content_items")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .in("id", ids.slice(0, 500))
      .eq("status", "draft")
      .select("id");
    if (error) throw new Error(error.message);

    revalidatePath("/content");
    return { success: true, count: data?.length ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível arquivar os rascunhos.";
    logger.error("ContentAction.archiveDrafts", "Erro ao arquivar rascunhos", { err });
    return { success: false, error: message };
  }
}

export interface ApproveResult extends ActionResult {
  approved: number;
  needsDate: string[];
  late: string[];
  failed: Array<{ id: string; error: string }>;
}

/**
 * Aprova artigos revisados para publicação na data que já está no Calendário.
 * Sem data (ou com a data já vencida) o artigo não é aprovado: é preciso escolher
 * uma data nova no próprio artigo.
 */
export async function approveContentAction(ids: string[]): Promise<ApproveResult> {
  const result: ApproveResult = { success: true, approved: 0, needsDate: [], late: [], failed: [] };
  try {
    await requireAuth();
    if (!Array.isArray(ids) || ids.length === 0) return result;
    const supabase = await getSupabaseServerClient();
    const { data: items, error } = await supabase
      .from("content_items")
      .select("id, body, status, editorial_calendar:editorial_calendar(scheduled_at)")
      .in("id", ids.slice(0, 200));
    if (error) throw new Error(error.message);

    for (const item of items ?? []) {
      if (!["reviewing", "draft", "ready"].includes(item.status)) continue;
      if (!item.body || item.body.trim().length === 0) {
        result.failed.push({ id: item.id, error: "O artigo ainda não tem texto." });
        continue;
      }
      const calendar = (Array.isArray(item.editorial_calendar) ? item.editorial_calendar[0] : item.editorial_calendar) as { scheduled_at?: string | null } | null;
      const scheduledAt = calendar?.scheduled_at;
      if (!scheduledAt) {
        result.needsDate.push(item.id);
        continue;
      }
      if (new Date(scheduledAt).getTime() <= Date.now()) {
        result.late.push(item.id);
        continue;
      }
      const scheduled = await scheduleContentAction(item.id, scheduledAt);
      if (scheduled.success) result.approved++;
      else result.failed.push({ id: item.id, error: scheduled.error ?? "Falha ao aprovar." });
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível aprovar os artigos.";
    logger.error("ContentAction.approve", "Erro ao aprovar artigos", { err });
    return { ...result, success: false, error: message };
  }
}

/**
 * Aprova o artigo revisado sem data: ele fica "pronto" e espera a etapa de
 * Calendário, onde a data de publicação é escolhida. Não publica nada.
 */
export async function approveReviewedContentAction(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const supabase = await getSupabaseServerClient();
    const { data: item, error: itemError } = await supabase
      .from("content_items")
      .select("id, body, status, editorial_calendar_id")
      .eq("id", id)
      .maybeSingle();
    if (itemError || !item) return { success: false, error: "Artigo não encontrado." };
    if (!["reviewing", "draft"].includes(item.status)) {
      return { success: false, error: "Só artigos em revisão podem ser aprovados." };
    }
    if (!item.body || item.body.trim().length === 0) {
      return { success: false, error: "O artigo precisa ter texto antes de ser aprovado." };
    }

    const { error } = await supabase
      .from("content_items")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["reviewing", "draft"]);
    if (error) throw new Error(error.message);

    // A data antiga da pauta não vale mais: a etapa Calendário escolhe a nova.
    if (item.editorial_calendar_id) {
      await supabase
        .from("editorial_calendar")
        .update({ scheduled_at: null, status: "IN_PROGRESS", updated_at: new Date().toISOString() })
        .eq("id", item.editorial_calendar_id)
        .neq("status", "PUBLISHED");
    }

    revalidatePath("/content");
    revalidatePath(`/content/${id}`);
    revalidatePath("/calendar");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível aprovar o artigo.";
    logger.error("ContentAction.approveReviewed", `Erro ao aprovar artigo ${id}`, { err });
    return { success: false, error: message };
  }
}

/**
 * Envia os artigos revisados selecionados para o Calendário, sem data: eles ficam
 * "prontos" e a data é escolhida depois, na etapa Calendário. Não publica nada.
 */
export async function sendReviewedToCalendarAction(ids: string[]): Promise<ActionResult & { count?: number; skipped?: number }> {
  try {
    await requireAuth();
    if (!Array.isArray(ids) || ids.length === 0) return { success: true, count: 0, skipped: 0 };
    const supabase = await getSupabaseServerClient();
    const { data: items, error } = await supabase
      .from("content_items")
      .select("id, body, status, editorial_calendar_id")
      .in("id", ids.slice(0, 500));
    if (error) throw new Error(error.message);

    let count = 0;
    let skipped = 0;
    for (const item of items ?? []) {
      if (!["reviewing", "draft"].includes(item.status) || !item.body || item.body.trim().length === 0) {
        skipped++;
        continue;
      }
      const { error: updateError } = await supabase
        .from("content_items")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", item.id)
        .in("status", ["reviewing", "draft"]);
      if (updateError) {
        skipped++;
        continue;
      }
      if (item.editorial_calendar_id) {
        await supabase
          .from("editorial_calendar")
          .update({ scheduled_at: null, status: "IN_PROGRESS", updated_at: new Date().toISOString() })
          .eq("id", item.editorial_calendar_id)
          .neq("status", "PUBLISHED");
      }
      count++;
    }

    revalidatePath("/content");
    revalidatePath("/calendar");
    return { success: true, count, skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível enviar ao calendário.";
    logger.error("ContentAction.sendToCalendar", "Erro ao enviar artigos ao calendário", { err });
    return { success: false, error: message };
  }
}

export interface AutoScheduleInput {
  blogId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  weekdayMode: "all" | "workdays" | "weekends";
  rules: Array<{ categoryId: string; perDay: number }>;
  times: string[];
}

/**
 * Agenda automaticamente os artigos aprovados (status ready) que ainda não têm data,
 * distribuindo-os no intervalo informado, por categoria e quantidade por dia.
 * Só mexe no blog informado.
 */
export async function autoScheduleApprovedAction(
  input: AutoScheduleInput
): Promise<ActionResult & { scheduled?: number; leftover?: number; skippedPastSlots?: number; failed?: number }> {
  try {
    await requireAuth();
    if (!input.blogId) return { success: false, error: "Escolha um blog antes de agendar." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
      return { success: false, error: "Informe a data inicial e a data final." };
    }
    if (input.endDate < input.startDate) return { success: false, error: "A data final é anterior à inicial." };
    if (input.rules.length === 0) return { success: false, error: "Escolha ao menos uma categoria." };
    if (input.times.length === 0) return { success: false, error: "Informe ao menos um horário por dia." };

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("content_items")
      .select(
        "id, title, body, status, created_at, editorial_calendar:editorial_calendar(id, scheduled_at, category_id, category:categories(id, name))"
      )
      .eq("blog_id", input.blogId)
      .eq("status", "ready")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Falha ao carregar artigos aprovados: ${error.message}`);

    type Row = {
      id: string;
      title: string;
      body: string | null;
      editorial_calendar: {
        scheduled_at: string | null;
        category_id: string | null;
        category: { id: string; name: string } | null;
      } | null;
    };
    const candidates = ((data ?? []) as unknown as Row[])
      .filter((row) => row.body?.trim() && !row.editorial_calendar?.scheduled_at)
      .filter((row) => row.editorial_calendar?.category_id && input.rules.some((r) => r.categoryId === row.editorial_calendar?.category_id))
      .map((row) => ({
        id: row.id,
        categoryId: row.editorial_calendar?.category_id ?? null,
        categoryName: row.editorial_calendar?.category?.name ?? "Geral",
        title: row.title,
      }));

    const plan = buildAutoSchedulePlan(candidates, {
      startDate: input.startDate,
      endDate: input.endDate,
      weekdayMode: input.weekdayMode,
      rules: input.rules,
      times: input.times,
    });

    let scheduled = 0;
    let failed = 0;
    for (const item of plan.items) {
      const result = await scheduleContentAction(item.contentId, item.scheduledAt);
      if (result.success) scheduled++;
      else {
        failed++;
        logger.error("ContentAction.autoSchedule", `Falha ao agendar ${item.contentId}`, { error: result.error });
      }
    }

    const leftover = Object.values(plan.leftoverByCategory).reduce((sum, n) => sum + n, 0);
    return { success: true, scheduled, leftover, skippedPastSlots: plan.skippedPastSlots, failed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível agendar automaticamente.";
    logger.error("ContentAction.autoSchedule", "Erro no agendamento automático", { err });
    return { success: false, error: message };
  }
}

/** Lista os artigos aprovados (ready) do blog que ainda não têm data, para a caixa de agendamento automático. */
export async function listApprovedUndatedAction(blogId: string) {
  await requireAuth();
  if (!blogId) return [];
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("content_items")
    .select("id, title, body, created_at, editorial_calendar:editorial_calendar(id, scheduled_at, category_id, category:categories(id, name))")
    .eq("blog_id", blogId)
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Falha ao carregar artigos aprovados: ${error.message}`);
  type Row = {
    id: string;
    title: string;
    body: string | null;
    editorial_calendar: { scheduled_at: string | null; category_id: string | null; category: { id: string; name: string } | null } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((row) => row.body?.trim() && !row.editorial_calendar?.scheduled_at)
    .map((row) => ({
      id: row.id,
      title: row.title,
      categoryId: row.editorial_calendar?.category_id ?? null,
      categoryName: row.editorial_calendar?.category?.name ?? "Geral",
    }));
}

/**
 * Exclui artigos que ainda estão em revisão ou rascunho. A exclusão é lógica:
 * o artigo vai para Arquivados, de onde pode ser recuperado. Nada publicado é tocado.
 */
export async function deleteReviewedContentAction(ids: string[]): Promise<ActionResult & { count?: number }> {
  try {
    await requireAuth();
    if (!Array.isArray(ids) || ids.length === 0) return { success: true, count: 0 };
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("content_items")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .in("id", ids.slice(0, 500))
      .in("status", ["reviewing", "draft"])
      .select("id");
    if (error) throw new Error(error.message);

    revalidatePath("/content");
    revalidatePath("/calendar");
    return { success: true, count: data?.length ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível excluir os artigos.";
    logger.error("ContentAction.deleteReviewed", "Erro ao excluir artigos", { err });
    return { success: false, error: message };
  }
}
