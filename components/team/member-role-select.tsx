"use client";

import { useTransition } from "react";
import { updateMemberRoleAction } from "@/app/actions/team";
import { OrganizationRole } from "@/types/database";

export function MemberRoleSelect({ userId, role, canAssignAdmin }: { userId: string; role: OrganizationRole; canAssignAdmin: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Papel do membro"
      value={role}
      disabled={pending}
      onChange={(event) => {
        const formData = new FormData();
        formData.set("user_id", userId);
        formData.set("role", event.target.value);
        startTransition(() => updateMemberRoleAction(formData));
      }}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
    >
      {canAssignAdmin && <option value="admin">Administrador</option>}
      <option value="editor">Editor</option>
      <option value="viewer">Visualizador</option>
    </select>
  );
}

