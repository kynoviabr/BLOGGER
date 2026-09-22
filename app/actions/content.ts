"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ContentService } from "@/services/content.service";
import { ContentItemUpdate } from "@/types/content";
import { requireAuth } from "@/lib/supabase/auth";
import { updateContentSchema } from "@/lib/validations/content.schema";
import { logger } from "@/lib/logger";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

export async function updateContentAction(
  id: string,
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    // 1. Autorização estrita
    await requireAuth();

    // 2. Validação com Zod
    const rawInput = {
      title: formData.get("title"),
      slug: formData.get("slug"),
      excerpt: formData.get("excerpt") || null,
      body: formData.get("body") || "",
      status: formData.get("status"),
      seo_title: formData.get("seo_title") || null,
      meta_description: formData.get("meta_description") || null,
    };

    const validation = updateContentSchema.safeParse(rawInput);
    if (!validation.success) {
      return { error: validation.error.issues[0]?.message || "Dados do artigo inválidos." };
    }

    const updates: ContentItemUpdate = {
      ...validation.data,
    };

    // 3. Persistência real
    await ContentService.updateContent(id, updates);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível salvar o artigo. Verifique a conexão com o banco e tente novamente.";
    logger.error("ContentAction.update", `Erro ao salvar artigo ${id}`, { err });
    return { error: message };
  }

  revalidatePath("/content");
  revalidatePath(`/content/${id}`);
  redirect("/content");
}
