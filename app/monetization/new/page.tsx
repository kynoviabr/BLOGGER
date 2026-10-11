import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BlogService } from "@/services/blog.service";
import { OfferForm } from "@/components/monetization/offer-form";

export const dynamic = "force-dynamic";

export default async function NewOfferPage() {
  const blogs = await BlogService.listBlogs().catch(() => []);

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
        title="Cadastrar Nova Oferta de Monetização"
        description="Configure o vínculo determinístico entre produto e categorias. O Box Visual HTML será injetado automaticamente nos artigos daquele tema."
      />

      <Card>
        <CardHeader>
          <CardTitle>Configurações da Oferta</CardTitle>
          <CardDescription>
            Selecione o blog, marque as categorias aplicáveis e defina o argumento de venda (pitch hook).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OfferForm blogs={blogs} />
        </CardContent>
      </Card>
    </div>
  );
}
