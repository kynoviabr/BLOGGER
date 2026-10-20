import { OrganizationRole, OrganizationStatus } from "@/types/database";

export interface OrganizationOption {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  role: OrganizationRole;
}

