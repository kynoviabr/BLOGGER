"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalendarService } from "@/services/calendar.service";
import { CalendarItemInsert, CalendarItemUpdate, CalendarStatus } from "@/types/calendar";
import { requireAuth } from "@/lib/supabase/auth";
import { createCalendarItemSchema, updateCalendarItemSchema } from "@/lib/validations/calendar.schema";
import { logger } from "@/lib/logger";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

export async function createCalendarItemAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    // 1. Autorização estrita
    await requireAuth();

    // 2. Tratamento e Validação com Zod
    const keywordsRaw = formData.get("keywords") as string;
    const keywords = keywordsRaw
      ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean)
      : [];

    const scheduledAtRaw = formData.get("scheduled_at") as string;
    const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : null;

    const rawInput = {
      blog_id: formData.get("blog_id"),
      category_id: formData.get("category_id") || null,
      language: formData.get("language") || "pt-BR",
      topic: formData.get("topic"),
      proposed_title: formData.get("proposed_title") || formData.get("topic"),
      keywords,
      article_type: formData.get("article_type") || "standard",
      scheduled_at: scheduledAt,
      priority: formData.get("priority") || "medium",
      status: formData.get("status") || "PLANNED",
      notes: formData.get("notes") || null,
    };

    const validation = createCalendarItemSchema.safeParse(rawInput);
    if (!validation.success) {
      return { error: validation.error.issues[0]?.message || "Dados da pauta inválidos." };
    }

    const input: CalendarItemInsert = {
      blog_id: validation.data.blog_id,
      category_id: validation.data.category_id || null,
      language: validation.data.language,
      topic: validation.data.topic,
      proposed_title: validation.data.proposed_title,
      keywords: validation.data.keywords,
      article_type: validation.data.article_type,
      scheduled_at: validation.data.scheduled_at || null,
      priority: validation.data.priority,
      status: validation.data.status,
      notes: validation.data.notes || null,
    };

    // 3. Persistência real
    await CalendarService.createCalendarItem(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível cadastrar a pauta. Verifique a conexão com o banco e tente novamente.";
    logger.error("CalendarAction.create", "Erro ao cadastrar pauta", { err });
    return { error: message };
  }

  revalidatePath("/calendar");
  revalidatePath("/");
  redirect("/calendar");
}

export async function updateCalendarItemAction(
  id: string,
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  let savedAsIdea = false;
  try {
    // 1. Autorização estrita
    await requireAuth();

    // 2. Validação com Zod
    const scheduledAtRaw = formData.get("scheduled_at") as string;
    const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : null;

    const rawInput = {
      topic: formData.get("topic"),
      proposed_title: formData.get("proposed_title"),
      status: formData.get("status"),
      priority: formData.get("priority"),
      scheduled_at: scheduledAt,
      language: formData.get("language") || undefined,
      notes: formData.get("notes") || null,
    };

    const validation = updateCalendarItemSchema.safeParse(rawInput);
    if (!validation.success) {
      return { error: validation.error.issues[0]?.message || "Dados de atualização da pauta inválidos." };
    }

    const updates: CalendarItemUpdate = {
      topic: validation.data.topic,
      proposed_title: validation.data.proposed_title,
      status: validation.data.status,
      priority: validation.data.priority,
      scheduled_at: validation.data.scheduled_at || null,
      language: validation.data.language,
      notes: validation.data.notes || null,
    };

    // 3. Persistência real
    await CalendarService.updateCalendarItem(id, updates);
    savedAsIdea = updates.status === "IDEA";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível atualizar a pauta. Verifique a conexão com o banco e tente novamente.";
    logger.error("CalendarAction.update", `Erro ao atualizar pauta ${id}`, { err });
    return { error: message };
  }

  revalidatePath("/calendar");
  revalidatePath(`/calendar/${id}`);
  revalidatePath("/ideas");
  revalidatePath("/");
  // Pautas ainda não aprovadas voltam para a aba de aprovação, não para o calendário.
  redirect(savedAsIdea ? "/ideas?tab=saved" : "/calendar");
}

export async function updateCalendarStatusAction(id: string, status: CalendarStatus) {
  await requireAuth();
  await CalendarService.updateStatus(id, status);
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function updateScheduleAction(id: string, scheduledAt: string | null, status: CalendarStatus = 'SCHEDULED') {
  await requireAuth();
  const updated = await CalendarService.updateItemSchedule(id, scheduledAt, status);
  revalidatePath("/calendar");
  revalidatePath("/");
  return { success: true, item: updated };
}

export async function bulkScheduleAction(
  schedules: Array<{ id: string; scheduledAt: string; status?: CalendarStatus }>
) {
  await requireAuth();
  const result = await CalendarService.bulkScheduleItems(schedules);
  revalidatePath("/calendar");
  revalidatePath("/");
  return result;
}

export async function bulkRevokeScheduleAction(ids: string[]) {
  await requireAuth();
  const result = await CalendarService.bulkRevokeSchedules(ids);
  revalidatePath("/calendar");
  revalidatePath("/");
  return result;
}


export async function listPendingIdeasAction(blogId?: string) {
  await requireAuth();
  return CalendarService.listCalendarItems({ blogId, status: 'IDEA' });
}

export async function prepareIdeasForGenerationAction(ids: string[]) {
  await requireAuth();
  const prepared = await CalendarService.prepareIdeasForGeneration(ids);
  revalidatePath("/ideas");
  return prepared;
}

export async function discardIdeasAction(ids: string[]) {
  await requireAuth();
  const result = await CalendarService.discardIdeas(ids);
  revalidatePath("/ideas");
  revalidatePath("/");
  return result;
}
