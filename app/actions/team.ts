"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationMembership } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { OrganizationRole } from "@/types/database";

const VALID_ROLES: OrganizationRole[] = ["owner", "admin", "editor", "viewer"];

export async function updateMemberRoleAction(formData: FormData): Promise<void> {
  const userId = String(formData.get("user_id") || "");
  const role = String(formData.get("role") || "") as OrganizationRole;
  const context = await requireOrganizationMembership();
  if (!userId || !VALID_ROLES.includes(role)) throw new Error("Dados de membro inválidos");
  if (userId === context.user.id) throw new Error("Você não pode alterar o próprio papel");
  if (context.role !== "owner" && context.role !== "admin") throw new Error("Sem permissão para alterar papéis");
  if (context.role === "admin" && !["editor", "viewer"].includes(role)) {
    throw new Error("Administradores só podem atribuir editor ou visualizador");
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("organization_id", context.organizationId)
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao atualizar papel: ${error.message}`);
  revalidatePath("/team");
  revalidatePath("/", "layout");
}

