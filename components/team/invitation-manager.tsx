"use client";

import { useActionState } from "react";
import { Copy, MailPlus, RefreshCw, X } from "lucide-react";
import { createInvitationAction, InvitationActionState, resendInvitationAction, revokeInvitationAction } from "@/app/actions/invitation";
import type { OrganizationInvitation } from "@/services/invitation.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const initialState: InvitationActionState = {};
const expiryFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function ResultMessage({ state }: { state: InvitationActionState }) {
  if (!state.error && !state.message) return null;
  return (
    <div className={`rounded-lg border p-3 text-xs ${state.error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-success"}`}>
      <p>{state.error || state.message}</p>
      {state.acceptanceUrl && (
        <div className="mt-2 flex gap-2">
          <Input readOnly value={state.acceptanceUrl} className="h-8 text-[11px]" />
          <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(state.acceptanceUrl!)}><Copy className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  );
}

export function InvitationManager({ invitations, canInviteAdmin }: { invitations: OrganizationInvitation[]; canInviteAdmin: boolean }) {
  const [createState, createAction, creating] = useActionState(createInvitationAction, initialState);
  const [resendState, resendAction, resending] = useActionState(resendInvitationAction, initialState);
  const pending = invitations.filter((invitation) => invitation.status === "pending");

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MailPlus className="h-4 w-4 text-primary" />Convidar membro</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <form action={createAction} className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
          <Input name="email" type="email" placeholder="pessoa@empresa.com" required disabled={creating} />
          <select name="role" defaultValue="editor" disabled={creating} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {canInviteAdmin && <option value="admin">Administrador</option>}
            <option value="editor">Editor</option>
            <option value="viewer">Visualizador</option>
          </select>
          <Button type="submit" disabled={creating}>{creating ? "Enviando..." : "Convidar"}</Button>
        </form>
        <ResultMessage state={createState} />
        <ResultMessage state={resendState} />

        {pending.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Convites pendentes</div>
            {pending.map((invitation) => (
              <div key={invitation.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="text-sm font-medium">{invitation.email}</div><div className="mt-1 flex gap-2"><Badge variant="outline">{invitation.role}</Badge><span className="text-xs text-muted-foreground">expira em {expiryFormatter.format(new Date(invitation.expires_at))}</span></div></div>
                <div className="flex gap-2">
                  <form action={resendAction}>
                    <input type="hidden" name="invitation_id" value={invitation.id} />
                    <input type="hidden" name="email" value={invitation.email} />
                    <input type="hidden" name="role" value={invitation.role} />
                    <Button type="submit" size="sm" variant="outline" disabled={resending}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Reenviar</Button>
                  </form>
                  <form action={revokeInvitationAction}>
                    <input type="hidden" name="invitation_id" value={invitation.id} />
                    <Button type="submit" size="sm" variant="ghost"><X className="mr-1.5 h-3.5 w-3.5" />Cancelar</Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

