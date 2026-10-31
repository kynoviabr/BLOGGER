"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BlogService } from "@/services/blog.service";
import { BlogInsert, BlogUpdate, WordPressConfig } from "@/types/blog";
import { requireAuth, requireOrganizationMembership } from "@/lib/supabase/auth";
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
    const { organizationId } = await requireOrganizationMembership();

    // 2. Validação com Zod
    const rawInput = {
      name: formData.get("name"),
      slug: formData.get("slug"),
      domain: formData.get("domain"),
      niche: formData.get("niche"),
      audience: formData.get("audience") || null,
      default_language: formData.get("default_language") || "pt-BR",
      description: formData.get("description") || null,
      wp_site_url: formData.get("wp_site_url") || null,
      wp_username: formData.get("wp_username") || null,
      wp_application_password: formData.get("wp_application_password") || null,
    };

    const validation = createBlogSchema.safeParse(rawInput);
    if (!validation.success) {
      return { error: validation.error.issues[0]?.message || "Dados do blog inválidos." };
    }

    const { name, slug, domain, niche, audience, default_language, description, wp_site_url, wp_username, wp_application_password } = validation.data;
    const finalSlug = slug && slug.trim().length > 0 ? slugify(slug) : slugify(name);

    const wordpressConfig: WordPressConfig = {};
    if (wp_site_url && wp_site_url.trim()) wordpressConfig.wp_site_url = wp_site_url.trim();
    if (wp_username && wp_username.trim()) wordpressConfig.wp_username = wp_username.trim();
    // Never store wp_application_password in editorial_config — Vault only

    const input: BlogInsert = {
      organization_id: organizationId,
      name,
      slug: finalSlug,
      domain,
      niche,
      audience: audience || null,
      default_language,
      description: description || null,
      status: "active",
      theme_config: { primary_color: "#2563eb", dark_mode: true },
      editorial_config: {
        min_words: 1200,
        max_words: 2500,
        tone: "autoritário e prático",
        ...(Object.keys(wordpressConfig).length > 0 ? { wordpress: wordpressConfig } : {}),
      },
      seo_config: { author_name: "Content Factory AI" },
      monetization_config: {},
    };

    // 3. Persistência real no Supabase
    const created = await BlogService.createBlog(input);

    // 4. Senha WordPress vai para o Vault deste blog (a fila de publicação só lê de lá).
    const wpPassVal = wp_application_password?.trim();
    if (wpPassVal) {
      const wpSiteUrlForVault = wordpressConfig.wp_site_url || "";
      const wpUserForVault = wordpressConfig.wp_username || "";
      if (!wpSiteUrlForVault.startsWith("https://") || !wpUserForVault) {
        return { error: "Blog criado, mas a senha WordPress não foi salva: informe a URL (https) e o usuário e salve de novo na edição do blog." };
      }
      const { getSupabaseServerClient } = await import("@/lib/supabase/server");
      const supabase = await getSupabaseServerClient();
      const { error: vaultError } = await supabase.rpc("upsert_blog_wordpress_credentials" as never, {
        p_blog_id: created.id, p_site_url: wpSiteUrlForVault, p_wp_username: wpUserForVault, p_wp_application_password: wpPassVal, p_enabled: true,
      } as never);
      if (vaultError) {
        return { error: `Blog criado, mas a senha WordPress não foi salva: ${vaultError.message}` };
      }
    }
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
      wp_site_url: formData.get("wp_site_url") || null,
      wp_username: formData.get("wp_username") || null,
      wp_application_password: formData.get("wp_application_password") || null,
    };

    const validation = updateBlogSchema.safeParse(rawInput);
    if (!validation.success) {
      return { error: validation.error.issues[0]?.message || "Dados de atualização inválidos." };
    }

    const blog = await BlogService.getBlogById(id);
    if (!blog) {
      return { error: "Blog não encontrado." };
    }

    const currentEd = (blog.editorial_config as Record<string, unknown>) || {};
    const currentWp = (currentEd.wordpress as WordPressConfig) || {};

    const updatedWp: WordPressConfig = {
      ...currentWp,
    };

    const wpSiteUrlVal = validation.data.wp_site_url?.trim();
    if (wpSiteUrlVal !== undefined) {
      updatedWp.wp_site_url = wpSiteUrlVal ? wpSiteUrlVal : undefined;
    }

    const wpUserVal = validation.data.wp_username?.trim();
    if (wpUserVal !== undefined) {
      updatedWp.wp_username = wpUserVal ? wpUserVal : undefined;
    }

    // WordPress password: migrate to Vault via RPC. Never persist in editorial_config JSON.
    const wpPassVal = validation.data.wp_application_password?.trim();
    const wpSiteUrlForVault = (validation.data.wp_site_url?.trim() || (updatedWp.wp_site_url as string | undefined) || "").trim();
    const wpUserForVault = (validation.data.wp_username?.trim() || (updatedWp.wp_username as string | undefined) || "").trim();
    if (wpPassVal && wpPassVal.length > 0) {
      if (!wpSiteUrlForVault || !wpSiteUrlForVault.startsWith("https://") || !wpUserForVault) {
        return { error: "Para salvar a senha WordPress, informe siteUrl (https) e usuário." };
      }
      const { getSupabaseServerClient } = await import("@/lib/supabase/server");
      const supabase = await getSupabaseServerClient();
      const { error: vaultError } = await supabase.rpc("upsert_blog_wordpress_credentials" as never, {
        p_blog_id: id, p_site_url: wpSiteUrlForVault, p_wp_username: wpUserForVault, p_wp_application_password: wpPassVal, p_enabled: true,
      } as never);
      if (vaultError) return { error: vaultError.message };
      // Ensure plaintext never lands in JSON
      delete (updatedWp as Record<string, unknown>).wp_application_password;
    } else {
      // No password supplied: strip any legacy plaintext that might still be in current JSON
      delete (updatedWp as Record<string, unknown>).wp_application_password;
    }

    const { wp_site_url, wp_username, wp_application_password: _omitPass, ...baseUpdates } = validation.data;

    const updates: BlogUpdate = {
      ...baseUpdates,
      editorial_config: {
        ...currentEd,
        wordpress: updatedWp,
      },
    };

    // 3. Persistência real
    await BlogService.updateBlog(id, updates);
    // Audit: WordPress credential rotation (no secret logged)
    if (wpPassVal && wpPassVal.length > 0) {
      try {
        const { getSupabaseServerClient: getServer } = await import("@/lib/supabase/server");
        const s = await getServer();
        await s.from("system_logs").insert({ level: "info", service: "BlogAction.update", message: `WordPress credential updated for blog ${id} (Vault)`, metadata: { blogId: id } });
      } catch {}
    }
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
