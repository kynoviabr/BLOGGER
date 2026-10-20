"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireOrganizationMembership } from "@/lib/supabase/auth";

export async function selectOrganizationAction(organizationId: string): Promise<void> {
  const membership = await requireOrganizationMembership(organizationId);
  const cookieStore = await cookies();
  cookieStore.set("selected_organization_id", membership.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  cookieStore.delete("selected_blog_id");
  revalidatePath("/", "layout");
}

