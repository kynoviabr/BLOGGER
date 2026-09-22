"use server";

import { revalidatePath } from "next/cache";
import { ContentService } from "@/services/content.service";
import { ContentItemUpdate, ContentStatus } from "@/types/content";
import { requireAuth } from "@/lib/supabase/auth";
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
        }
      : data;

    const validation = updateContentSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0]?.message || "Dados do artigo inválidos." };
    }

    const updates: ContentItemUpdate = {
      ...validation.data,
    };

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
