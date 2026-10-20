"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { InvitationRole, InvitationService } from "@/services/invitation.service";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_ORGANIZATION_COOKIE, requireAuth } from "@/lib/supabase/auth";

export interface InvitationActionState {
  error?: string;
  message?: string;
  acceptanceUrl?: string;
}

export async function createInvitationAction(_previous: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  try {
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const role = String(formData.get("role") || "viewer") as InvitationRole;
    if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Informe um e-mail válido." };
    if (!["admin", "editor", "viewer"].includes(role)) return { error: "Papel inválido." };
    const result = await InvitationService.issueInvitation({ email, role });
    revalidatePath("/team");
    return { message: result.message, acceptanceUrl: result.delivered ? undefined : result.acceptanceUrl };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao enviar convite." };
  }
}

export async function resendInvitationAction(_previous: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  try {
    const invitationId = String(formData.get("invitation_id") || "");
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const role = String(formData.get("role") || "viewer") as InvitationRole;
    const result = await InvitationService.issueInvitation({ invitationId, email, role });
    revalidatePath("/team");
    return { message: result.message, acceptanceUrl: result.delivered ? undefined : result.acceptanceUrl };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao reenviar convite." };
  }
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  await InvitationService.revokeInvitation(String(formData.get("invitation_id") || ""));
  revalidatePath("/team");
}

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  await requireAuth();
  const token = String(formData.get("token") || "");
  if (!token) throw new Error("Token de convite ausente");
  const supabase = await getSupabaseServerClient();
  const { data: organizationId, error } = await supabase.rpc("accept_organization_invitation", { raw_token: token });
  if (error || !organizationId) throw new Error(error?.message || "Não foi possível aceitar o convite");
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31536000,
  });
  cookieStore.delete("selected_blog_id");
  redirect("/team?invitation=accepted");
}

