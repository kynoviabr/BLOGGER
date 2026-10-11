"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MonetizationService } from "@/services/monetization";
import { offerSchema } from "@/lib/validations/monetization.schema";
import { requireAuth } from "@/lib/supabase/auth";
import { logger } from "@/lib/logger";
import { CreateOfferInput, UpdateOfferInput } from "@/types/monetization";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

export async function createOfferAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireAuth();

    const categoryIdsRaw = formData.getAll("category_ids");
    const category_ids = categoryIdsRaw.map((c) => c.toString()).filter(Boolean);

    const rawInput = {
      blog_id: formData.get("blog_id"),
      title: formData.get("title"),
      offer_type: formData.get("offer_type"),
      category_ids,
      is_global_fallback:
        formData.get("is_global_fallback") === "true" ||
        formData.get("is_global_fallback") === "on",
      pitch_hook: formData.get("pitch_hook"),
      cta_button_text: formData.get("cta_button_text"),
      affiliate_url: formData.get("affiliate_url"),
      badge_text: formData.get("badge_text") || null,
      priority: formData.get("priority") || 5,
      is_active: formData.get("is_active") !== "false",
    };

    const validation = offerSchema.safeParse(rawInput);
    if (!validation.success) {
      return {
        error:
          validation.error.issues[0]?.message ||
          "Dados inválidos para a oferta de monetização.",
      };
    }

    const input: CreateOfferInput = {
      ...validation.data,
      badge_text: validation.data.badge_text || null,
    };

    await MonetizationService.createOffer(input);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Erro desconhecido ao salvar a oferta de monetização.";
    logger.error("MonetizationAction.create", "Erro ao cadastrar oferta", { err });
    return { error: message };
  }

  revalidatePath("/monetization");
  redirect("/monetization");
}

export async function updateOfferAction(
  id: string,
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireAuth();

    const categoryIdsRaw = formData.getAll("category_ids");
    const category_ids = categoryIdsRaw.map((c) => c.toString()).filter(Boolean);

    const rawInput = {
      blog_id: formData.get("blog_id"),
      title: formData.get("title"),
      offer_type: formData.get("offer_type"),
      category_ids,
      is_global_fallback:
        formData.get("is_global_fallback") === "true" ||
        formData.get("is_global_fallback") === "on",
      pitch_hook: formData.get("pitch_hook"),
      cta_button_text: formData.get("cta_button_text"),
      affiliate_url: formData.get("affiliate_url"),
      badge_text: formData.get("badge_text") || null,
      priority: formData.get("priority") || 5,
      is_active: formData.get("is_active") !== "false",
    };

    const validation = offerSchema.safeParse(rawInput);
    if (!validation.success) {
      return {
        error:
          validation.error.issues[0]?.message ||
          "Dados de atualização inválidos.",
      };
    }

    const updates: UpdateOfferInput = {
      ...validation.data,
      badge_text: validation.data.badge_text || null,
    };

    await MonetizationService.updateOffer(id, updates);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Erro ao atualizar a oferta de monetização.";
    logger.error("MonetizationAction.update", `Erro ao atualizar oferta ${id}`, { err });
    return { error: message };
  }

  revalidatePath("/monetization");
  revalidatePath(`/monetization/${id}`);
  redirect("/monetization");
}

export async function toggleOfferStatusAction(id: string) {
  try {
    await requireAuth();
    await MonetizationService.toggleOfferStatus(id);
    revalidatePath("/monetization");
  } catch (err) {
    logger.error("MonetizationAction.toggle", `Erro ao alternar status da oferta ${id}`, { err });
    throw err;
  }
}

export async function deleteOfferAction(id: string) {
  try {
    await requireAuth();
    await MonetizationService.deleteOffer(id);
    revalidatePath("/monetization");
  } catch (err) {
    logger.error("MonetizationAction.delete", `Erro ao excluir oferta ${id}`, { err });
    throw err;
  }
}

export async function backfillMonetizationAction(params: {
  blogId?: string;
  articleId?: string;
  forceUpdateExisting?: boolean;
  syncWordPress?: boolean;
  statusFilter?: ("published" | "ready" | "draft")[];
}) {
  try {
    await requireAuth();

    if (!params.blogId && !params.articleId) {
      return {
        success: false,
        error: "É obrigatório fornecer o Blog alvo ou o Artigo para retroalimentação.",
      };
    }

    const { MonetizationBackfillService } = await import(
      "@/services/monetization/monetization-backfill.service"
    );

    if (params.articleId) {
      const result = await MonetizationBackfillService.backfillSingleArticle(params.articleId, {
        forceUpdateExisting: params.forceUpdateExisting,
        syncWordPress: params.syncWordPress,
      });

      revalidatePath(`/content/${params.articleId}`);
      revalidatePath("/content");

      return {
        success: result.supabaseUpdated,
        data: result,
      };
    }

    const batchResult = await MonetizationBackfillService.backfillBlogArticles(params.blogId!, {
      forceUpdateExisting: params.forceUpdateExisting,
      syncWordPress: params.syncWordPress,
      statusFilter: params.statusFilter,
    });

    revalidatePath("/monetization");
    revalidatePath("/content");

    return {
      success: true,
      data: batchResult,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("MonetizationAction.backfill", "Erro no backfill de monetização", { err });
    return {
      success: false,
      error: message,
    };
  }
}

