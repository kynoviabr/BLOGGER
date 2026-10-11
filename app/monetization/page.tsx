import { PageHeader } from "@/components/shared/page-header";
import { MonetizationService } from "@/services/monetization";
import { BlogService } from "@/services/blog.service";
import { OffersList } from "@/components/monetization/offers-list";
import { MonetizationOffer } from "@/types/monetization";
import { BlogWithRelations } from "@/types/blog";

export const dynamic = "force-dynamic";

export default async function MonetizationPage() {
  let offers: MonetizationOffer[] = [];
  let blogs: BlogWithRelations[] = [];
  let errorMsg: string | null = null;

  try {
    [offers, blogs] = await Promise.all([
      MonetizationService.listOffers(),
      BlogService.listBlogs(),
    ]);
  } catch (err) {
    errorMsg =
      err instanceof Error
        ? err.message
        : "Erro ao carregar dados do módulo de monetização.";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Motor de Monetização & Afiliados"
        description="Vincule ofertas de Produtos Próprios (e-books, mentorias) e Links de Afiliados diretamente às categorias dos seus blogs. Injeção determinística de boxes HTML de alta conversão sem depender de adivinhações da IA."
      />

      {errorMsg ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
          {errorMsg}
        </div>
      ) : (
        <OffersList initialOffers={offers} blogs={blogs} />
      )}
    </div>
  );
}
