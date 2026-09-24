"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/supabase/auth";
import { CategoryService } from "@/services/category.service";
import { logger } from "@/lib/logger";

export interface CategoryActionResult {
  error?: string;
  success?: boolean;
}

export async function createCategoryAction(
  prevState: CategoryActionResult | null,
  formData: FormData
): Promise<CategoryActionResult> {
  try {
    await requireAuth();

    const blogId = formData.get("blog_id") as string;
    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string | undefined;
    const description = formData.get("description") as string | undefined;

    if (!blogId || !name || !name.trim()) {
      return { error: "Nome da categoria e ID do blog são obrigatórios." };
    }

    await CategoryService.createCategory({
      blog_id: blogId,
      name: name.trim(),
      slug: slug?.trim() || undefined,
      description: description?.trim() || null,
    });

    revalidatePath(`/blogs/${blogId}`);
    revalidatePath("/ideas");
    revalidatePath("/calendar");

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao criar categoria.";
    logger.error("CategoryAction.create", "Erro ao criar categoria", { err });
    return { error: message };
  }
}

export async function updateCategoryAction(
  prevState: CategoryActionResult | null,
  formData: FormData
): Promise<CategoryActionResult> {
  try {
    await requireAuth();

    const categoryId = formData.get("category_id") as string;
    const blogId = formData.get("blog_id") as string;
    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string | undefined;
    const description = formData.get("description") as string | undefined;

    if (!categoryId || !name || !name.trim()) {
      return { error: "ID da categoria e nome são obrigatórios." };
    }

    await CategoryService.updateCategory(categoryId, {
      name: name.trim(),
      slug: slug?.trim() || undefined,
      description: description !== undefined ? (description?.trim() || null) : undefined,
    });

    if (blogId) {
      revalidatePath(`/blogs/${blogId}`);
    }
    revalidatePath("/ideas");
    revalidatePath("/calendar");

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar categoria.";
    logger.error("CategoryAction.update", "Erro ao atualizar categoria", { err });
    return { error: message };
  }
}

export async function deleteCategoryAction(
  categoryId: string,
  blogId: string
): Promise<CategoryActionResult> {
  try {
    await requireAuth();

    if (!categoryId) {
      return { error: "ID da categoria é obrigatório." };
    }

    await CategoryService.deleteCategory(categoryId);

    revalidatePath(`/blogs/${blogId}`);
    revalidatePath("/ideas");
    revalidatePath("/calendar");

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao remover categoria.";
    logger.error("CategoryAction.delete", `Erro ao remover categoria ${categoryId}`, { err });
    return { error: message };
  }
}
