import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/auth";
import { OrganizationOption } from "@/types/organization";
import { logger } from "@/lib/logger";

export class OrganizationService {
  static async listOrganizations(): Promise<OrganizationOption[]> {
    const user = await requireAuth();
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("organization_members")
      .select("role, organization:organizations!inner(id, name, slug, status)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("organization.status", "active")
      .order("joined_at", { ascending: true });

    if (error) {
      logger.error("OrganizationService.listOrganizations", "Falha ao carregar empresas", { error });
      throw new Error(`Falha ao carregar empresas: ${error.message}`);
    }

    return (data || []).flatMap((membership) => {
      const organization = membership.organization as unknown as {
        id: string;
        name: string;
        slug: string;
        status: "active" | "suspended" | "archived";
      } | null;
      return organization ? [{ ...organization, role: membership.role }] : [];
    });
  }
}

