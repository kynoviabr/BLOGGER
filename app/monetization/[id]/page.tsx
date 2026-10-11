import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MonetizationService } from "@/services/monetization";
import { BlogService } from "@/services/blog.service";
import { OfferForm } from "@/components/monetization/offer-form";

export const dynamic = "force-dynamic";

export default async function EditOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [offer, blogs] = await Promise.all([
    MonetizationService.getOfferById(id).catch(() => null),
    BlogService.listBlogs().catch(() => []),
  ]);

  if (!offer) {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href="/monetization"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para Monetização
      </Link>

      <PageHeader
        title={`Editar Oferta: ${offer.title}`}
        description="Atualize os parâmetros da oferta, categorias vinculadas ou status de exibição."
      />

      <Card>
        <CardHeader>
          <CardTitle>Configurações da Oferta</CardTitle>
          <CardDescription>
            Alterações refletem imediatamente nos próximos artigos gerados e publicados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OfferForm blogs={blogs} offer={offer} />
        </CardContent>
      </Card>
    </div>
  );
}
