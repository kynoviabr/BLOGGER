import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "@/app/actions/invitation";

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto max-w-lg py-16">
      <Card>
        <CardHeader><CardTitle>Aceitar convite</CardTitle><CardDescription>Confirme para entrar na empresa com o e-mail desta sessão.</CardDescription></CardHeader>
        <CardContent>
          {token ? (
            <form action={acceptInvitationAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <Button type="submit" className="w-full">Aceitar e acessar a empresa</Button>
            </form>
          ) : <p className="text-sm text-destructive">Este link de convite está incompleto.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

