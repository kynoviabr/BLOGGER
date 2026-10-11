"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Sparkles, Tag, Globe, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { BlogWithRelations } from "@/types/blog";
import { MonetizationOffer, OfferType, OFFER_TYPE_LABELS } from "@/types/monetization";
import { createOfferAction, updateOfferAction, ActionResult } from "@/app/actions/monetization";

interface OfferFormProps {
  blogs: BlogWithRelations[];
  offer?: MonetizationOffer;
}

export function OfferForm({ blogs, offer }: OfferFormProps) {
  const [selectedBlogId, setSelectedBlogId] = useState<string>(
    offer?.blog_id || blogs[0]?.id || ""
  );
  const [isGlobalFallback, setIsGlobalFallback] = useState<boolean>(
    offer?.is_global_fallback ?? false
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    offer?.category_ids || []
  );

  // Estados para Live Preview
  const [title, setTitle] = useState(offer?.title || "");
  const [pitchHook, setPitchHook] = useState(offer?.pitch_hook || "");
  const [ctaText, setCtaText] = useState(offer?.cta_button_text || "Conhecer o Método de 30 Dias");
  const [badgeText, setBadgeText] = useState(offer?.badge_text || "GUIA OFICIAL • RECOMENDAÇÃO");
  const [affiliateUrl, setAffiliateUrl] = useState(offer?.affiliate_url || "https://...");

  const [state, setState] = useState<ActionResult>({});
  const [isPending, startTransition] = useTransition();

  // Encontra o blog atualmente selecionado
  const currentBlog = blogs.find((b) => b.id === selectedBlogId);
  const availableCategories = currentBlog?.categories || [];

  const handleCategoryToggle = (catIdentifier: string) => {
    setSelectedCategories((prev) =>
      prev.includes(catIdentifier)
        ? prev.filter((c) => c !== catIdentifier)
        : [...prev, catIdentifier]
    );
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // Garante que todas as categorias selecionadas sejam anexadas
    formData.delete("category_ids");
    selectedCategories.forEach((cat) => {
      formData.append("category_ids", cat);
    });

    if (isGlobalFallback) {
      formData.set("is_global_fallback", "true");
    } else {
      formData.set("is_global_fallback", "false");
    }

    startTransition(async () => {
      let result: ActionResult;
      if (offer) {
        result = await updateOfferAction(offer.id, null, formData);
      } else {
        result = await createOfferAction(null, formData);
      }
      if (result?.error) {
        setState(result);
      }
    });
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Formulário de Edição (7 colunas) */}
      <form onSubmit={handleSubmit} className="space-y-6 lg:col-span-7">
        {state?.error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-rose-50 p-3.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{state.error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Seleção do Blog */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Blog Alvo *
            </label>
            <Select
              name="blog_id"
              value={selectedBlogId}
              onChange={(e) => setSelectedBlogId(e.target.value)}
              disabled={isPending}
            >
              {blogs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.domain})
                </option>
              ))}
            </Select>
          </div>

          {/* Tipo de Oferta */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Tipo de Oferta *
            </label>
            <Select
              name="offer_type"
              defaultValue={offer?.offer_type || "OWN_PRODUCT"}
              disabled={isPending}
            >
              <option value="OWN_PRODUCT">Produto Próprio (E-book / Curso)</option>
              <option value="AFFILIATE_CPA">Afiliado CPA (Conta / Cartão)</option>
              <option value="AFFILIATE_TOOL">Ferramenta / Software Parceiro</option>
              <option value="BOOK_AMAZON">Livro Amazon KDP</option>
            </Select>
          </div>
        </div>

        {/* Título da Oferta */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Título do Produto / Oferta *
          </label>
          <Input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Destrave Seu Score em 30 Dias: O Método Oficial"
            required
            disabled={isPending}
          />
        </div>

        {/* Categorias Vinculadas */}
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                Categorias do Blog para Injeção Automática
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Marque em quais categorias do blog este produto DEVE ser exibido nos artigos.
              </p>
            </div>
          </div>

          {availableCategories.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Nenhuma categoria cadastrada para este blog. Cadastre categorias na página do blog ou use o fallback global abaixo.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 pt-1">
              {availableCategories.map((cat) => {
                const identifier = cat.slug || cat.id;
                const isChecked = selectedCategories.includes(identifier);
                return (
                  <label
                    key={cat.id}
                    className={`flex items-center gap-2.5 rounded-md border p-2.5 text-xs cursor-pointer transition-colors ${
                      isChecked
                        ? "border-primary/50 bg-primary/10 text-primary font-medium"
                        : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleCategoryToggle(identifier)}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>{cat.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      ({cat.slug})
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Toggle de Fallback Global */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-primary" />
                Usar como Oferta Global (Fallback)
              </span>
              <p className="text-[11px] text-muted-foreground">
                Se ativado, esta oferta aparecerá em qualquer categoria do blog caso aquela categoria específica não tenha uma oferta própria cadastrada.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isGlobalFallback}
                onChange={(e) => setIsGlobalFallback(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>

        {/* Pitch Hook */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Pitch Hook (Argumento de Venda Curto) *
          </label>
          <Textarea
            name="pitch_hook"
            value={pitchHook}
            onChange={(e) => setPitchHook(e.target.value)}
            rows={3}
            placeholder="Ex: Aprenda a auditar a caixa-preta do Banco Central (SCR/Registrato) e aplicar a estratégia do Banco Principal para voltar a ter crédito aprovado..."
            required
            disabled={isPending}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* CTA Button Text */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Texto do Botão CTA *
            </label>
            <Input
              name="cta_button_text"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder="Ex: Conhecer o Método de 30 Dias"
              required
              disabled={isPending}
            />
          </div>

          {/* Badge Text */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Badge / Selo da Oferta (Opcional)
            </label>
            <Input
              name="badge_text"
              value={badgeText}
              onChange={(e) => setBadgeText(e.target.value)}
              placeholder="Ex: GUIA OFICIAL • R$ 29,90"
              disabled={isPending}
            />
          </div>
        </div>

        {/* Affiliate URL */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            URL de Destino / Link de Afiliado *
          </label>
          <Input
            name="affiliate_url"
            value={affiliateUrl}
            onChange={(e) => setAffiliateUrl(e.target.value)}
            placeholder="https://universododinheiro.com.br/ir/destrave-score"
            required
            disabled={isPending}
          />
          <p className="text-[11px] text-muted-foreground">
            Será renderizado automaticamente com as tags seguras <code className="text-primary font-mono">{'target="_blank" rel="sponsored noopener"'}</code>.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Prioridade */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Prioridade (1 a 10)
            </label>
            <Input
              type="number"
              name="priority"
              defaultValue={offer?.priority ?? 5}
              min={1}
              max={10}
              disabled={isPending}
            />
            <p className="text-[11px] text-muted-foreground">
              Desempate se houver múltiplos produtos na mesma categoria (maior número = mais prioridade).
            </p>
          </div>

          {/* Status Ativo */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Status da Oferta
            </label>
            <Select
              name="is_active"
              defaultValue={offer?.is_active === false ? "false" : "true"}
              disabled={isPending}
            >
              <option value="true">Ativa (Injetando nos artigos)</option>
              <option value="false">Pausada (Não injetar)</option>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Link href="/monetization">
            <Button type="button" variant="outline" disabled={isPending}>
              Cancelar
            </Button>
          </Link>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : offer ? (
              "Salvar Alterações"
            ) : (
              "Cadastrar Oferta"
            )}
          </Button>
        </div>
      </form>

      {/* Visual Live Preview (5 colunas) */}
      <div className="space-y-4 lg:col-span-5">
        <div className="sticky top-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Visualização no Artigo (Live Preview)
            </span>
          </div>

          {/* Box Visual HTML Exato */}
          <div
            style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              borderLeft: "5px solid #0d9488",
              borderRadius: "8px",
              padding: "24px",
              margin: "12px 0",
              color: "#f8fafc",
              fontFamily: "system-ui, -apple-system, sans-serif",
              boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
            }}
          >
            <span
              style={{
                backgroundColor: "#0d9488",
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                padding: "4px 10px",
                borderRadius: "4px",
                display: "inline-block",
                marginBottom: "10px",
              }}
            >
              {badgeText || "RECOMENDAÇÃO DO EDITOR"}
            </span>
            <h3
              style={{
                color: "#ffffff",
                margin: "0 0 10px 0",
                fontSize: "18px",
                lineHeight: 1.3,
                fontWeight: 700,
              }}
            >
              {title || "Título do Produto / E-book Oficial"}
            </h3>
            <p
              style={{
                color: "#cbd5e1",
                fontSize: "14px",
                lineHeight: 1.5,
                margin: "0 0 18px 0",
              }}
            >
              {pitchHook ||
                "Aqui será exibido o argumento de venda direto e persuasivo conectando o tema do artigo a este produto..."}
            </p>
            <a
              href={affiliateUrl || "#"}
              target="_blank"
              rel="sponsored noopener"
              style={{
                backgroundColor: "#14b8a6",
                color: "#0f172a",
                fontWeight: 800,
                fontSize: "14px",
                textDecoration: "none",
                padding: "10px 20px",
                borderRadius: "6px",
                display: "inline-block",
              }}
              onClick={(e) => e.preventDefault()}
            >
              {ctaText || "Acessar Oferta"} →
            </a>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 space-y-2 mt-4">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span>Regras de Injeção Determinística:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px]">
              <li>Injetado como <strong>Box Visual #1</strong> logo após o 2º subtítulo &lt;h2&gt; do artigo.</li>
              <li>Link de rastreamento com atributo <code className="text-primary font-mono">{'rel="sponsored noopener"'}</code> em conformidade com Google SEO e Rank Math.</li>
              <li>Prioridade automática para produtos próprios (<code className="font-mono text-primary">OWN_PRODUCT</code>) sobre afiliados de terceiros.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
