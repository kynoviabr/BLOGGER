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
