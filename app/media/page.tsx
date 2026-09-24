import { Image as ImageIcon, Sparkles, Calendar, Layers, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MediaService } from "@/services/media.service";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { MediaAsset } from "@/types/media";

export default async function MediaPage() {
  let mediaAssets: MediaAsset[] = [];
  let loadError: string | null = null;

  try {
    mediaAssets = await MediaService.listMedia();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Não foi possível carregar os assets de mídia.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Galeria de Mídia"
        description="Imagens, infográficos e assets visuais gerados pela IA para os artigos dos blogs."
      />

      {loadError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Erro ao consultar mídias no Supabase:</span>
            {loadError}
          </div>
        </div>
      )}

      {mediaAssets.length === 0 && !loadError ? (
        <EmptyState
          title="Nenhum asset de mídia gerado"
          description="Os assets de imagem e mídia criados automaticamente pelos workers aparecerão aqui."
          icon={<ImageIcon className="h-6 w-6" />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {mediaAssets.map((asset) => (
            <Card key={asset.id} className="overflow-hidden group">
              <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.public_url}
                  alt={asset.alt_text || "Asset de mídia"}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute top-2 right-2">
                  <Badge variant="default" className="backdrop-blur-md bg-black/60 text-white border-0">
                    {asset.type.toUpperCase()}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-4 space-y-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground block">
                    Alt Text
                  </span>
                  <p className="text-xs text-foreground line-clamp-2">
                    {asset.alt_text || "Sem texto alternativo"}
                  </p>
                </div>

                {asset.prompt && (
                  <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/40 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1 font-semibold text-foreground mb-1">
                      <Sparkles className="h-3 w-3 text-primary" />
                      Prompt de Geração:
                    </div>
                    <p className="line-clamp-2 italic">{asset.prompt}</p>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    Provedor: {asset.provider}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(asset.created_at)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
