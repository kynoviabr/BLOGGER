"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BlogService } from "@/services/blog.service";
import { BlogInsert, BlogUpdate } from "@/types/blog";
import { requireAuth } from "@/lib/supabase/auth";
import { createBlogSchema, updateBlogSchema } from "@/lib/validations/blog.schema";
import { slugify } from "@/lib/utils";
import { logger } from "@/lib/logger";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

export async function createBlogAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    // 1. Autorização estrita
    const user = await requireAuth();

    // 2. Validação com Zod
    const rawInput = {
      name: formData.get("name"),
      slug: formData.get("slug"),
      domain: formData.get("domain"),
      niche: formData.get("niche"),
      audience: formData.get("audience") || null,
      default_language: formData.get("default_language") || "pt-BR",
      description: formData.get("description") || null,
    };

    const validation = createBlogSchema.safeParse(rawInput);
    if (!validation.success) {
      return { error: validation.error.issues[0]?.message || "Dados do blog inválidos." };
    }

    const { name, slug, domain, niche, audience, default_language, description } = validation.data;
    const finalSlug = slug && slug.trim().length > 0 ? slugify(slug) : slugify(name);

    const input: BlogInsert = {
      name,
      slug: finalSlug,
      domain,
      niche,
      audience: audience || null,
      default_language,
      description: description || null,
      status: "active",
      theme_config: { primary_color: "#2563eb", dark_mode: true },
      editorial_config: { min_words: 1200, max_words: 2500, tone: "autoritário e prático" },
      seo_config: { author_name: "Content Factory AI" },
      monetization_config: {},
    };

    // 3. Persistência real no Supabase
    await BlogService.createBlog(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível salvar o blog. Verifique a conexão com o banco e tente novamente.";
    logger.error("BlogAction.create", "Erro ao criar blog", { err });
    return { error: message };
  }

  revalidatePath("/blogs");
  revalidatePath("/");
  redirect("/blogs");
}

export async function updateBlogAction(
  id: string,
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    // 1. Autorização estrita
    await requireAuth();

    // 2. Validação com Zod
    const rawInput = {
      name: formData.get("name"),
      domain: formData.get("domain"),
      niche: formData.get("niche"),
      audience: formData.get("audience") || null,
      description: formData.get("description") || null,
      default_language: formData.get("default_language") || undefined,
      status: formData.get("status"),
    };

    const validation = updateBlogSchema.safeParse(rawInput);
    if (!validation.success) {
      return { error: validation.error.issues[0]?.message || "Dados de atualização inválidos." };
    }

    const updates: BlogUpdate = {
      ...validation.data,
    };

    // 3. Persistência real
    await BlogService.updateBlog(id, updates);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível atualizar o blog. Verifique a conexão com o banco e tente novamente.";
    logger.error("BlogAction.update", `Erro ao atualizar blog ${id}`, { err });
    return { error: message };
  }

  revalidatePath("/blogs");
  revalidatePath(`/blogs/${id}`);
  redirect("/blogs");
}

export async function toggleBlogStatusAction(id: string) {
  await requireAuth();
  await BlogService.toggleBlogStatus(id);
  revalidatePath("/blogs");
  revalidatePath("/");
}

export async function updateAutopilotConfigAction(
  id: string,
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireAuth();

    const autopilot_enabled =
      formData.get("autopilot_enabled") === "true" ||
      formData.get("autopilot_enabled") === "on";
    const autopilot_start_time =
      formData.get("autopilot_start_time")?.toString().trim() || "06:00";
    const autopilot_interval_minutes = Math.max(
      1,
      parseInt(formData.get("autopilot_interval_minutes")?.toString() || "30", 10)
    );
    const autopilot_daily_limit = Math.max(
      1,
      parseInt(formData.get("autopilot_daily_limit")?.toString() || "5", 10)
    );

    const blog = await BlogService.getBlogById(id);
    if (!blog) {
      return { error: "Blog não encontrado." };
    }

    const currentEd = (blog.editorial_config as Record<string, unknown>) || {};
    const updatedEd = {
      ...currentEd,
      autopilot: {
        autopilot_enabled,
        autopilot_start_time,
        autopilot_interval_minutes,
        autopilot_daily_limit,
      },
    };

    // Atualiza editorial_config e tenta atualizar colunas se existirem
    try {
      await BlogService.updateBlog(id, {
        editorial_config: updatedEd,
        autopilot_enabled,
        autopilot_start_time,
        autopilot_interval_minutes,
        autopilot_daily_limit,
      } as BlogUpdate);
    } catch {
      await BlogService.updateBlog(id, {
        editorial_config: updatedEd,
      });
    }

    revalidatePath(`/blogs/${id}`);
    revalidatePath("/blogs");
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Erro ao salvar configurações do Autopilot.";
    logger.error("BlogAction.updateAutopilot", `Erro ao configurar autopilot no blog ${id}`, { err });
    return { error: message };
  }
}

