import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireOrganizationMembership } from "@/lib/supabase/auth";
import { OrganizationRole } from "@/types/database";

export type InvitationRole = Exclude<OrganizationRole, "owner">;
export type OrganizationInvitation = {
  id: string;
  email: string;
  role: InvitationRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
};

async function getApplicationUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionHost) return `https://${productionHost}`;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  if (process.env.NODE_ENV !== "production" && host) return `http://${host}`;
  return "https://blogger-kynoviabrs-projects.vercel.app";
}

export class InvitationService {
  static async listInvitations(): Promise<OrganizationInvitation[]> {
    const { organizationId, role } = await requireOrganizationMembership();
    if (role !== "owner" && role !== "admin") return [];
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("organization_invitations")
      .select("id, email, role, status, expires_at, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Falha ao carregar convites: ${error.message}`);
    return (data || []) as OrganizationInvitation[];
  }

  static async issueInvitation(input: { email: string; role: InvitationRole; invitationId?: string }) {
    const context = await requireOrganizationMembership();
    if (context.role !== "owner" && context.role !== "admin") throw new Error("Sem permissão para convidar membros");
    if (context.role === "admin" && input.role === "admin") throw new Error("Somente proprietários podem convidar administradores");

    const email = input.email.trim().toLowerCase();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const supabase = await getSupabaseServerClient();

    await supabase
      .from("organization_invitations")
      .update({ status: "expired" })
      .eq("organization_id", context.organizationId)
      .eq("email", email)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    if (input.invitationId) {
      const { error } = await supabase
        .from("organization_invitations")
        .update({ token_hash: tokenHash, expires_at: expiresAt, status: "pending" })
        .eq("id", input.invitationId)
        .eq("organization_id", context.organizationId)
        .eq("email", email);
      if (error) throw new Error(`Falha ao renovar convite: ${error.message}`);
    } else {
      const { error } = await supabase.from("organization_invitations").insert({
        organization_id: context.organizationId,
        email,
        role: input.role,
        token_hash: tokenHash,
        invited_by: context.user.id,
        expires_at: expiresAt,
      });
      if (error?.code === "23505") throw new Error("Já existe um convite pendente para este e-mail");
      if (error) throw new Error(`Falha ao criar convite: ${error.message}`);
    }

    const appUrl = await getApplicationUrl();
    const acceptanceUrl = `${appUrl}/invite/accept?token=${encodeURIComponent(token)}`;
    const callbackUrl = `${appUrl}/auth/callback?invitation=${encodeURIComponent(token)}`;
    const admin = getSupabaseAdminClient();
    const { error: deliveryError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: callbackUrl,
      data: { organization_id: context.organizationId, organization_role: input.role },
    });

    return {
      delivered: !deliveryError,
      acceptanceUrl,
      message: deliveryError
        ? "O convite foi criado, mas o Supabase não enviou o e-mail. Compartilhe o link seguro abaixo com o destinatário."
        : "Convite enviado por e-mail com sucesso.",
    };
  }

  static async revokeInvitation(invitationId: string): Promise<void> {
    const { organizationId, role } = await requireOrganizationMembership();
    if (role !== "owner" && role !== "admin") throw new Error("Sem permissão para cancelar convites");
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase
      .from("organization_invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId)
      .eq("organization_id", organizationId)
      .eq("status", "pending");
    if (error) throw new Error(`Falha ao cancelar convite: ${error.message}`);
  }
}

