import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationMembership } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { OrganizationMemberStatus, OrganizationRole } from "@/types/database";

export interface TeamMember {
  userId: string;
  email: string;
  role: OrganizationRole;
  status: OrganizationMemberStatus;
  joinedAt: string;
}

export class TeamService {
  static async listMembers(): Promise<TeamMember[]> {
    const { organizationId } = await requireOrganizationMembership();
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("organization_members")
      .select("user_id, role, status, joined_at")
      .eq("organization_id", organizationId)
      .order("joined_at", { ascending: true });

    if (error) throw new Error(`Falha ao carregar equipe: ${error.message}`);

    const admin = getSupabaseAdminClient();
    return Promise.all((data || []).map(async (membership) => {
      const { data: userData } = await admin.auth.admin.getUserById(membership.user_id);
      return {
        userId: membership.user_id,
        email: userData.user?.email || "Usuário sem e-mail",
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joined_at,
      };
    }));
  }
}

