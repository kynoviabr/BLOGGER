"use server";

import { revalidatePath } from "next/cache";
import { ContentService } from "@/services/content.service";
import { ContentItemUpdate, ContentStatus } from "@/types/content";
import { requireAuth } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateContentSchema } from "@/lib/validations/content.schema";
import { logger } from "@/lib/logger";

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
      .select("id, blog_id, title, body, language, status, editorial_calendar_id")
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
