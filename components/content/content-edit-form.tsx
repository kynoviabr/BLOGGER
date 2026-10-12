"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Image as ImageIcon,
  Send,
  Zap,
  Tag as TagIcon,
  Search,
} from "lucide-react";
import { ContentItemWithRelations } from "@/types/content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { SUPPORTED_LANGUAGES, getLanguageConfig } from "@/config/languages";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import { updateContentAction } from "@/app/actions/content";
import { backfillMonetizationAction } from "@/app/actions/monetization";

interface ContentEditFormProps {
  content: ContentItemWithRelations;
}

export function ContentEditForm({ content: initialContent }: ContentEditFormProps) {
  const router = useRouter();
  const [content, setContent] = useState<ContentItemWithRelations>(initialContent);
  const [formData, setFormData] = useState({
    title: initialContent.title,
    slug: initialContent.slug,
    excerpt: initialContent.excerpt || "",
    body: initialContent.body || "",
    seo_title: initialContent.seo_title || "",
    meta_description: initialContent.meta_description || "",
    focus_keyword: initialContent.focus_keyword || "",
    tags: Array.isArray(initialContent.tags) ? initialContent.tags.join(", ") : "",
    status: initialContent.status,
  });

  // Feedback e Loading States
  const [isSaving, startSaving] = useTransition();
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [selectedGenerationLanguage, setSelectedGenerationLanguage] = useState<string>(
    initialContent.language || "pt-BR"
  );
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    if (type === "success") {
      setTimeout(() => setNotification(null), 6000);
    }
  };

  // 1. Salvar alterações manuais do formulário
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    startSaving(async () => {
      try {
        const payload = {
          ...formData,
          tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        };
        const result = await updateContentAction(content.id, null, payload);
        if (result.success) {
          showNotification("success", "Artigo salvo com sucesso!");
          router.refresh();
        } else {
          showNotification("error", result.error || "Falha ao salvar artigo.");
        }
      } catch (err) {
        showNotification("error", err instanceof Error ? err.message : "Erro ao salvar.");
      }
    });
  };

  // 2. Disparar Endpoint de Geração de Artigo com IA
  const handleGenerateText = async (languageToUse?: string) => {
    const lang = languageToUse || selectedGenerationLanguage || content.language || "pt-BR";
    setNotification(null);
    setIsGeneratingText(true);

    try {
      const res = await fetch(`/api/content/${content.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao gerar artigo com IA.");
      }

      // Atualiza estado local imediatamente na UI
      const updated = data.data;
      setContent((prev) => ({
        ...prev,
        title: updated.title,
        slug: updated.slug,
        meta_description: updated.meta_description,
        body: updated.body,
        status: updated.status,
        focus_keyword: updated.focus_keyword,
        tags: updated.tags,
        language: lang,
      }));
      setFormData((prev) => ({
        ...prev,
        title: updated.title,
        slug: updated.slug,
        meta_description: updated.meta_description || "",
        body: updated.body,
        status: updated.status,
        focus_keyword: updated.focus_keyword || "",
        tags: Array.isArray(updated.tags) ? updated.tags.join(", ") : (updated.tags || ""),
      }));

      const langInfo = getLanguageConfig(lang);
      showNotification(
        "success",
        `Artigo gerado com sucesso em ${langInfo.name} (${langInfo.flag})! Status atualizado para READY.`
      );
      router.refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao gerar artigo com IA.");
    } finally {
      setIsGeneratingText(false);
    }
  };

  // 3. Disparar Endpoint de Geração de Imagem de Destaque
  const handleGenerateImage = async () => {
    setNotification(null);
    setIsGeneratingImage(true);

    try {
      const res = await fetch(`/api/content/${content.id}/image`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao gerar imagem de destaque.");
      }

      if (data.media) {
        setContent((prev) => ({
          ...prev,
          featured_image_id: data.media.id,
          featured_image: data.media,
        }));
      }

      showNotification("success", "Imagem de destaque gerada e vinculada ao artigo com sucesso!");
      router.refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao gerar imagem.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 4. Disparar Endpoint de Publicação no WordPress
  const handlePublish = async () => {
    if (!formData.body || formData.body.trim().length === 0) {
      showNotification("error", "O artigo precisa ter corpo de texto antes de ser publicado.");
      return;
    }

    setNotification(null);
    setIsPublishing(true);

    try {
      const res = await fetch(`/api/content/${content.id}/publish`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao publicar post no WordPress.");
      }

      setContent((prev) => ({
        ...prev,
        status: "published",
        published_at: data.publishResult?.publishedAt || new Date().toISOString(),
      }));
      setFormData((prev) => ({
        ...prev,
        status: "published",
      }));

      showNotification(
        "success",
        `Artigo publicado com sucesso no WordPress! ID: ${data.publishResult?.postId || ""}`
      );
      router.refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao publicar no WordPress.");
    } finally {
      setIsPublishing(false);
    }
  };

  // 5. Injetar / Atualizar Ofertas de Monetização (Backfill)
  const handleBackfillMonetization = async () => {
    if (!formData.body || formData.body.trim().length === 0) {
      showNotification("error", "O artigo precisa ter corpo de texto antes de receber ofertas.");
      return;
    }

    setNotification(null);
    setIsBackfilling(true);

    try {
      const res = await backfillMonetizationAction({
        articleId: content.id,
        forceUpdateExisting: true,
        syncWordPress: true,
      });

      if (!res.success || !res.data) {
        throw new Error(res.error || "Falha ao retroalimentar monetização do artigo.");
      }

      const info = res.data as {
        offersInjected?: string[];
        wordpressSynced?: boolean;
        wordpressPostId?: number;
      };
      const injectedMsg = info.offersInjected && info.offersInjected.length > 0
        ? `Ofertas injetadas: ${info.offersInjected.join(", ")}.`
        : "";
      const wpMsg = info.wordpressSynced
        ? `Sincronizado no WordPress (ID ${info.wordpressPostId}).`
        : "";

      showNotification(
        "success",
        `Monetização retroalimentada com sucesso! ${injectedMsg} ${wpMsg}`.trim()
      );
      router.refresh();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao retroalimentar monetização.");
    } finally {
      setIsBackfilling(false);
    }
  };

  const isAnyActionRunning = isSaving || isGeneratingText || isGeneratingImage || isPublishing || isBackfilling;

  return (
    <div className="space-y-6">
      {/* Alerta de Notificação / Toast Inline */}
      {notification && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 text-xs ${
            notification.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          )}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* PAINEL DE AÇÕES DO MAESTRO / ORQUESTRADOR */}
      <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-900/50 dark:bg-blue-950/20 shadow-sm">
        <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Painel do Maestro de Conteúdo
              </h2>
              <StatusBadge status={content.status} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dispare sob demanda as etapas de produção de inteligência artificial e publicação remota.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1. Gerar Artigo com IA */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsGenerateModalOpen(true)}
              disabled={isAnyActionRunning}
              className="bg-white hover:bg-slate-50 border-blue-200 text-blue-700 hover:text-blue-800 dark:bg-slate-900 dark:border-blue-900 dark:text-blue-300"
            >
              {isGeneratingText ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Gerando Artigo...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-purple-600" />
                  Gerar Artigo ({getLanguageConfig(content.language).flag} {getLanguageConfig(content.language).code})
                </>
              )}
            </Button>

            {/* 2. Gerar Imagem de Destaque */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateImage}
              disabled={isAnyActionRunning}
              className="bg-white hover:bg-slate-50 border-amber-200 text-amber-700 hover:text-amber-800 dark:bg-slate-900 dark:border-amber-900 dark:text-amber-300"
            >
              {isGeneratingImage ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Gerando Imagem...
                </>
              ) : (
                <>
                  <ImageIcon className="mr-1.5 h-3.5 w-3.5 text-amber-600" />
                  Gerar Imagem de Destaque
                </>
              )}
            </Button>

            {/* 3. Injetar / Atualizar Ofertas de Monetização */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBackfillMonetization}
              disabled={isAnyActionRunning || !formData.body}
              className="bg-white hover:bg-slate-50 border-teal-200 text-teal-700 hover:text-teal-800 dark:bg-slate-900 dark:border-teal-900 dark:text-teal-300"
            >
              {isBackfilling ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Injetando Ofertas...
                </>
              ) : (
                <>
                  <Zap className="mr-1.5 h-3.5 w-3.5 text-teal-600" />
                  Injetar Ofertas
                </>
              )}
            </Button>

            {/* 4. Publicar no WordPress */}
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePublish}
              disabled={isAnyActionRunning || !formData.body}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Publicando no WP...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Publicar no WordPress
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Coluna Principal: Editor de Conteúdo (2 colunas) */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Corpo do Artigo</CardTitle>
                <CardDescription>
                  Edite o conteúdo em texto estruturado / Markdown gerado pelo pipeline.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Título Principal
                  </label>
                  <Input
                    name="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    disabled={isAnyActionRunning}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Slug da URL
                  </label>
                  <Input
                    name="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    required
                    disabled={isAnyActionRunning}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Resumo / Excerpt
                  </label>
                  <Textarea
                    name="excerpt"
                    value={formData.excerpt}
                    onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                    rows={2}
                    placeholder="Breve resumo introdutório do artigo..."
                    disabled={isAnyActionRunning}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Corpo do Artigo (Markdown / HTML)
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {formData.body ? `${formData.body.split(/\s+/).filter(Boolean).length} palavras` : "0 palavras"}
                    </span>
                  </div>
                  <Textarea
                    name="body"
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                    rows={16}
                    className="font-mono text-xs leading-relaxed"
                    placeholder="Clique no botão 'Gerar Artigo com IA' acima ou digite o texto aqui..."
                    disabled={isAnyActionRunning}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Metadados de SEO */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Otimização SEO (Search Engine Optimization)</CardTitle>
                    <CardDescription>
                      Metadados e taxonomia para indexação e sincronização com Yoast SEO & Rank Math no WordPress.
                    </CardDescription>
                  </div>
                  {formData.focus_keyword && (
                    <Badge variant="success" className="text-xs">
                      SEO Ativo
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Palavra-Chave Foco */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Search className="h-3.5 w-3.5 text-blue-500" />
                      Palavra-Chave Foco (Focus Keyword)
                    </label>
                    {(() => {
                      const words = formData.focus_keyword.trim()
                        ? formData.focus_keyword.trim().split(/\s+/).length
                        : 0;
                      if (words === 0) {
                        return <Badge variant="outline" className="text-[10px]">Não definida</Badge>;
                      }
                      if (words >= 3 && words <= 5) {
                        return <Badge variant="success" className="text-[10px]">{words} palavras (Ideal: 3-5)</Badge>;
                      }
                      return <Badge variant="warning" className="text-[10px]">{words} palavras</Badge>;
                    })()}
                  </div>
                  <Input
                    name="focus_keyword"
                    value={formData.focus_keyword}
                    onChange={(e) => setFormData({ ...formData, focus_keyword: e.target.value })}
                    placeholder="Ex: como declarar tesouro direto"
                    disabled={isAnyActionRunning}
                  />
                  <p className="text-[11px] text-slate-500">
                    Sincronizada diretamente com os campos <code className="font-mono text-[10px]">_yoast_wpseo_focuskw</code> e <code className="font-mono text-[10px]">rank_math_focus_keyword</code> no WordPress.
                  </p>
                </div>

                {/* Título SEO */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Título SEO (Tag Title)
                  </label>
                  <Input
                    name="seo_title"
                    value={formData.seo_title}
                    onChange={(e) => setFormData({ ...formData, seo_title: e.target.value })}
                    placeholder="Título otimizado para SERPs..."
                    disabled={isAnyActionRunning}
                  />
                </div>

                {/* Meta Description com contador de caracteres */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Meta Description
                    </label>
                    {(() => {
                      const len = formData.meta_description.length;
                      if (len === 0) {
                        return <Badge variant="outline" className="text-[10px]">0 / 160 caracteres</Badge>;
                      }
                      if (len >= 140 && len <= 160) {
                        return <Badge variant="success" className="text-[10px]">{len} / 160 caracteres (Ideal)</Badge>;
                      }
                      if (len > 160) {
                        return <Badge variant="warning" className="text-[10px]">{len} / 160 caracteres (Truncará no Google)</Badge>;
                      }
                      return <Badge variant="info" className="text-[10px]">{len} / 160 caracteres (Mín. 140)</Badge>;
                    })()}
                  </div>
                  <Textarea
                    name="meta_description"
                    value={formData.meta_description}
                    onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                    rows={2}
                    placeholder="Descrição persuasiva contendo a Focus Keyword (140-160 caracteres)..."
                    disabled={isAnyActionRunning}
                  />
                  <p className="text-[11px] text-slate-500">
                    Ideal entre 140 e 160 caracteres para exibição perfeita nos snippets de busca do Google e redes sociais.
                  </p>
                </div>

                {/* Tags do Artigo (WordPress Tags) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <TagIcon className="h-3.5 w-3.5 text-indigo-500" />
                      Tags do Artigo (WordPress)
                    </label>
                    {(() => {
                      const tagsList = formData.tags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean);
                      return (
                        <Badge variant={tagsList.length >= 4 && tagsList.length <= 6 ? "success" : "info"} className="text-[10px]">
                          {tagsList.length} tags (Ideal: 4-6)
                        </Badge>
                      );
                    })()}
                  </div>
                  <Input
                    name="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="Separe as tags por vírgula (ex: renda fixa, tesouro direto, tesouro selic, reserva de emergencia)"
                    disabled={isAnyActionRunning}
                  />
                  {formData.tags && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {formData.tags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .map((tag, idx) => (
                          <Badge key={idx} variant="info" className="text-[11px] font-normal">
                            #{tag}
                          </Badge>
                        ))}
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Tags são resolvidas ou criadas automaticamente no WordPress via <code className="font-mono text-[10px]">/wp-json/wp/v2/tags</code> no momento da publicação.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coluna Lateral: Status, Mídia, Fontes e AI Runs (1 coluna) */}
          <div className="space-y-6">
            {/* Ciclo Editorial & Salvar Manual */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ciclo Editorial</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">
                    Status Atual
                  </label>
                  <Select
                    name="status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    disabled={isAnyActionRunning}
                  >
                    <option value="draft">Rascunho (Draft)</option>
                    <option value="reviewing">Em Revisão</option>
                    <option value="ready">Pronto para Publicar</option>
                    <option value="scheduled">Agendado</option>
                    <option value="published">Publicado</option>
                    <option value="archived">Arquivado</option>
                  </Select>
                </div>

                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40 text-xs space-y-1 text-slate-500">
                  <div>Criado em: {formatDate(content.created_at)}</div>
                  {content.published_at && (
                    <div className="text-emerald-600 font-medium">
                      Publicado em: {formatDate(content.published_at)}
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isAnyActionRunning}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando Artigo...
                    </>
                  ) : (
                    "Salvar Alterações Manuais"
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Imagem de Destaque */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-amber-600" />
                  Imagem de Destaque
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {content.featured_image ? (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={content.featured_image.public_url}
                      alt={content.featured_image.alt_text || "Imagem destacada"}
                      className="w-full h-36 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                    />
                    <p className="text-[11px] text-slate-500 line-clamp-2">
                      {content.featured_image.alt_text}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
                    Nenhuma imagem associada. Clique em &quot;Gerar Imagem de Destaque&quot;.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Histórico de IA (AI Runs) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  Histórico de IA (AI Runs)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {content.ai_runs && content.ai_runs.length > 0 ? (
                  content.ai_runs.map((run) => (
                    <div
                      key={run.id}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40 text-xs space-y-1"
                    >
                      <div className="flex justify-between font-medium text-slate-800 dark:text-slate-200">
                        <span>{run.agent}</span>
                        <span className="text-emerald-600">{run.model}</span>
                      </div>
                      <p className="text-slate-500 text-[11px]">{run.output_summary}</p>
                      <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                        <span>Duração: {run.duration_ms}ms</span>
                        <span>Custo: ${Number(run.estimated_cost).toFixed(6)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">Nenhuma execução de IA registrada.</p>
                )}
              </CardContent>
            </Card>

            {/* Fontes de Pesquisa */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  Fontes Citadas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {content.sources && content.sources.length > 0 ? (
                  content.sources.map((src) => (
                    <a
                      key={src.id}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-700 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300"
                    >
                      <span className="truncate max-w-[200px]">{src.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">Nenhuma fonte cadastrada.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </form>

      {/* Modal de Confirmação de Idioma para Geração */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title="Confirmar Geração de Artigo com IA"
        description="Confirme o idioma e as diretrizes editoriais antes de iniciar a produção do artigo."
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 dark:bg-slate-800/40 dark:border-slate-700 text-xs space-y-1">
            <div className="text-slate-500 font-medium">Pauta / Título do Artigo:</div>
            <div className="text-slate-900 dark:text-slate-100 font-semibold text-sm">
              {content.title}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Idioma de Produção *
            </label>
            <Select
              value={selectedGenerationLanguage}
              onChange={(e) => setSelectedGenerationLanguage(e.target.value)}
              disabled={isGeneratingText}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name} ({lang.code})
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-slate-500">
              O vocabulário, estrutura gramatical, pesquisa factual e avisos legais serão rigorosamente adaptados para a região do idioma selecionado.
            </p>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsGenerateModalOpen(false)}
              disabled={isGeneratingText}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setIsGenerateModalOpen(false);
                handleGenerateText(selectedGenerationLanguage);
              }}
              disabled={isGeneratingText}
              className="gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              Confirmar e Gerar Artigo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
