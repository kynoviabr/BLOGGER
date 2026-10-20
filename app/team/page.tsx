import { Users, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TeamService } from "@/services/team.service";
import { requireOrganizationMembership } from "@/lib/supabase/auth";
import { MemberRoleSelect } from "@/components/team/member-role-select";
import { formatDate } from "@/lib/utils";
import { OrganizationRole } from "@/types/database";

const roleLabels: Record<OrganizationRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  editor: "Editor",
  viewer: "Visualizador",
};

export default async function TeamPage() {
  const [members, context] = await Promise.all([
    TeamService.listMembers(),
    requireOrganizationMembership(),
  ]);
  const canManage = context.role === "owner" || context.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader title="Equipe" description="Membros e permissões da empresa ativa." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardContent className="flex items-center gap-3 p-5"><Users className="h-5 w-5 text-primary" /><div><div className="text-2xl font-semibold">{members.length}</div><div className="text-xs text-muted-foreground">membros</div></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-5"><ShieldCheck className="h-5 w-5 text-primary" /><div><div className="text-sm font-semibold">{roleLabels[context.role]}</div><div className="text-xs text-muted-foreground">seu nível de acesso</div></div></CardContent></Card>
      </div>
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>Membro</TableHead><TableHead>Status</TableHead><TableHead>Desde</TableHead><TableHead className="text-right">Papel</TableHead></TableRow></TableHeader>
          <TableBody>
            {members.map((member) => {
              const editable = canManage && member.userId !== context.user.id && (context.role === "owner" || ["editor", "viewer"].includes(member.role));
              return (
                <TableRow key={member.userId}>
                  <TableCell><div className="font-medium">{member.email}</div>{member.userId === context.user.id && <div className="text-xs text-muted-foreground">Você</div>}</TableCell>
                  <TableCell><Badge variant={member.status === "active" ? "success" : "outline"}>{member.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(member.joinedAt)}</TableCell>
                  <TableCell className="text-right">
                    {editable ? (
                      <MemberRoleSelect userId={member.userId} role={member.role} canAssignAdmin={context.role === "owner"} />
                    ) : <Badge variant="outline">{roleLabels[member.role]}</Badge>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

