import { marked } from "marked";
import { getLegalDisclaimerHtml } from "@/config/languages";
import { MonetizationOffer } from "@/types/monetization";

export interface FormattedContentResult {
  html: string;
  excerpt: string;
}

export const OFFICIAL_LEGAL_DISCLAIMER_HTML =
  getLegalDisclaimerHtml('pt-BR', false);

export const INVESTMENT_RISK_DISCLAIMER_HTML =
  getLegalDisclaimerHtml('pt-BR', true);

export const MONETIZATION_BOX_PRIMARY_START = "<!-- MONETIZATION_BOX_PRIMARY_START -->";
export const MONETIZATION_BOX_PRIMARY_END = "<!-- MONETIZATION_BOX_PRIMARY_END -->";
export const MONETIZATION_BOX_SECONDARY_START = "<!-- MONETIZATION_BOX_SECONDARY_START -->";
export const MONETIZATION_BOX_SECONDARY_END = "<!-- MONETIZATION_BOX_SECONDARY_END -->";

/**
 * Constrói o Box Visual HTML padronizado para uma oferta de monetização com marcadores invisíveis de idempotência.
 */
export function buildMonetizationBoxHtml(
  offer: MonetizationOffer,
  position: 'primary' | 'secondary' = 'primary'
): string {
  const badge =
    offer.badge_text?.trim() ||
    (offer.offer_type === 'OWN_PRODUCT'
      ? 'GUIA TÉCNICO OFICIAL'
      : 'RECOMENDAÇÃO DO EDITOR');

  const startMarker =
    position === 'primary'
      ? MONETIZATION_BOX_PRIMARY_START
      : MONETIZATION_BOX_SECONDARY_START;
  const endMarker =
    position === 'primary'
      ? MONETIZATION_BOX_PRIMARY_END
      : MONETIZATION_BOX_SECONDARY_END;

  const innerHtml = `<div class="ud-monetization-box" data-monetization-box="${position}" data-offer-id="${offer.id}" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-left: 5px solid #0d9488; border-radius: 8px; padding: 24px; margin: 28px 0; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
  <span style="background-color: #0d9488; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 4px 10px; border-radius: 4px; display: inline-block; margin-bottom: 10px;">${badge}</span>
  <h3 style="color: #ffffff; margin: 0 0 10px 0; font-size: 20px; line-height: 1.3;">${offer.title}</h3>
  <p style="color: #cbd5e1; font-size: 15px; line-height: 1.5; margin: 0 0 18px 0;">${offer.pitch_hook}</p>
  <a href="${offer.affiliate_url}" target="_blank" rel="sponsored noopener" style="background-color: #14b8a6; color: #0f172a; font-weight: 800; font-size: 15px; text-decoration: none; padding: 12px 22px; border-radius: 6px; display: inline-block;">${offer.cta_button_text} →</a>
</div>`;

  return `${startMarker}\n${innerHtml}\n${endMarker}`;
}

/**
 * Remove qualquer caixa de monetização existente do HTML (seja com marcadores ou classes legadas).
 */
export function removeExistingMonetizationBoxes(html: string): string {
  if (!html) return '';

  let cleaned = html;

  // 1. Remove blocos marcados por comentários HTML
  cleaned = cleaned.replace(/<!--\s*MONETIZATION_BOX_PRIMARY_START\s*-->[\s\S]*?<!--\s*MONETIZATION_BOX_PRIMARY_END\s*-->/gi, '');
  cleaned = cleaned.replace(/<!--\s*MONETIZATION_BOX_SECONDARY_START\s*-->[\s\S]*?<!--\s*MONETIZATION_BOX_SECONDARY_END\s*-->/gi, '');

  // 2. Remove tags legadas com class "ud-monetization-box" (caso não tenham os comentários)
  cleaned = cleaned.replace(/<div[^>]*class=["'][^"']*ud-monetization-box[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');

  // 3. Normaliza quebras de linha excessivas deixadas pela remoção
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Verifica se o HTML já contém caixas de monetização.
 */
export function hasMonetizationBoxes(html: string): boolean {
  if (!html) return false;
  return (
    html.includes('ud-monetization-box') ||
    html.includes('data-monetization-box') ||
    html.includes(MONETIZATION_BOX_PRIMARY_START) ||
    html.includes(MONETIZATION_BOX_SECONDARY_START)
  );
}

/**
 * Injeta deterministicamente as ofertas no corpo HTML:
 * - Oferta Principal #1: inserida logo após o 2º <h2> (ou o 1º se houver apenas um)
 * - Oferta Secundária #2: inserida no fechamento do artigo, antes do disclaimer legal
 */
export function injectMonetizationBoxes(
  html: string,
  offers?: MonetizationOffer[],
  options?: { forceReplace?: boolean }
): string {
  if (!offers || offers.length === 0) return html;

  let result = html;

  // Se forceReplace estiver ativo, remove todas as caixas anteriores primeiro
  if (options?.forceReplace) {
    result = removeExistingMonetizationBoxes(result);
  }

  const primaryOffer = offers[0];
  const secondaryOffer = offers.length > 1 ? offers[1] : null;

  // Injeta a Oferta Principal #1
  const primaryBoxAlreadyPresent =
    result.includes(MONETIZATION_BOX_PRIMARY_START) ||
    (primaryOffer && result.includes(primaryOffer.affiliate_url));

  if (primaryOffer && !primaryBoxAlreadyPresent) {
    const primaryBox = buildMonetizationBoxHtml(primaryOffer, 'primary');

    let h2Count = 0;
    let targetIndex = -1;
    const h2Regex = /<\/h2>/gi;
    let match: RegExpExecArray | null;

    while ((match = h2Regex.exec(result)) !== null) {
      h2Count++;
      if (h2Count === 2) {
        targetIndex = match.index + match[0].length;
        break;
      }
    }

    if (targetIndex !== -1) {
      result =
        result.slice(0, targetIndex) +
        '\n\n' +
        primaryBox +
        '\n\n' +
        result.slice(targetIndex);
    } else {
      const firstH2 = result.search(/<\/h2>/i);
      if (firstH2 !== -1) {
        const insertPos = firstH2 + 5;
        result =
          result.slice(0, insertPos) +
          '\n\n' +
          primaryBox +
          '\n\n' +
          result.slice(insertPos);
      } else {
        // Fallback para Markdown puro: procura por ## Título
        const mdH2Regex = /(?:^|\n)##\s+[^\n]+\n/g;
        let mdMatch: RegExpExecArray | null;
        let mdCount = 0;
        let mdTargetIndex = -1;
        while ((mdMatch = mdH2Regex.exec(result)) !== null) {
          mdCount++;
          if (mdCount === 2) {
            mdTargetIndex = mdMatch.index + mdMatch[0].length;
            break;
          }
        }
        if (mdTargetIndex !== -1) {
          result =
            result.slice(0, mdTargetIndex) +
            '\n\n' +
            primaryBox +
            '\n\n' +
            result.slice(mdTargetIndex);
        } else {
          const firstMdH2 = result.search(/(?:^|\n)##\s+[^\n]+\n/);
          if (firstMdH2 !== -1) {
            const matchLen = result.slice(firstMdH2).match(/(?:^|\n)##\s+[^\n]+\n/)?.[0]?.length || 0;
            const insertPos = firstMdH2 + matchLen;
            result =
              result.slice(0, insertPos) +
              '\n\n' +
              primaryBox +
              '\n\n' +
              result.slice(insertPos);
          } else {
            result = `${primaryBox}\n\n${result}`;
          }
        }
      }
    }
  }

  // Injeta a Oferta Secundária #2 (se diferente da primária)
  const secondaryBoxAlreadyPresent =
    result.includes(MONETIZATION_BOX_SECONDARY_START) ||
    (secondaryOffer && result.includes(secondaryOffer.affiliate_url));

  if (
    secondaryOffer &&
    secondaryOffer.id !== primaryOffer.id &&
    !secondaryBoxAlreadyPresent
  ) {
    const secondaryBox = buildMonetizationBoxHtml(secondaryOffer, 'secondary');
    if (result.includes('<p class="ud-aviso">')) {
      result = result.replace(
        '<p class="ud-aviso">',
        `${secondaryBox}\n\n<p class="ud-aviso">`
      );
    } else {
      result = `${result}\n\n${secondaryBox}`;
    }
  }

  return result;
}

/**
 * Sanitiza o Markdown de entrada:
 * - Converte sequências literais "\\n" em quebras reais de linha.
 * - Remove títulos H1 (# Título) duplicados no início do corpo.
 * - Remove delimitadores de bloco de código (```markdown ... ```).
 */
export function sanitizeMarkdown(rawMarkdown: string, postTitle?: string): string {
  if (!rawMarkdown) return "";

  // 1. Converte quebras literais "\\n" ou "\\r\\n" em quebras reais
  let text = rawMarkdown
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "  ");

  // 2. Remove blocos delimitadores ```markdown ou ```html no topo/fundo
  text = text.replace(/^\s*```(?:markdown|html)?\s*\n?/i, "");
  text = text.replace(/\n?\s*```\s*$/i, "");

  // 3. Remove H1 duplicado no início (# Título)
  text = text.replace(/^\s*#\s+[^\n]+\n+/i, "");

  // Se o título exato do post aparecer repetido como primeira linha
  if (postTitle) {
    const cleanTitle = postTitle.trim().toLowerCase();
    const parts = text.split("\n");
    if (parts[0] && parts[0].replace(/^#+\s*/, "").trim().toLowerCase() === cleanTitle) {
      parts.shift();
      text = parts.join("\n").trim();
    }
  }

  return text.trim();
}

/**
 * Converte Markdown para HTML semântico válido com suporte completo a tabelas e listas.
 */
export async function convertMarkdownToHtml(markdown: string): Promise<string> {
  const html = await marked.parse(markdown, {
    gfm: true,
    breaks: true,
  });

  return html.trim();
}

/**
 * Produz excerpt de 140 a 160 caracteres limpo e bem pontuado para SEO.
 */
export function generateExcerpt(contentOrDescription: string, minChars = 140, maxChars = 160): string {
  let clean = contentOrDescription
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_~`|\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= maxChars && clean.length >= minChars) {
    return clean;
  }

  if (clean.length > maxChars) {
    const truncated = clean.slice(0, maxChars - 3);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > minChars - 10 ? truncated.slice(0, lastSpace) : truncated).trim() + "...";
  }

  return clean;
}

/**
 * Pipeline completo de formatação de conteúdo para publicação no WordPress:
 * 1. Sanitiza Markdown.
 * 2. Converte para HTML semântico com tabelas.
 * 3. Injeta o parágrafo de aviso legal <p class="ud-aviso">.
 * 4. Retorna HTML e excerpt válido.
 */
export async function formatArticleForWordPress(
  rawMarkdown: string,
  options: {
    title: string;
    categorySlug?: string;
    providedExcerpt?: string;
    language?: string;
    offers?: MonetizationOffer[];
    blogName?: string;
    niche?: string;
    customDisclaimer?: string;
  }
): Promise<FormattedContentResult> {
  const sanitizedMd = sanitizeMarkdown(rawMarkdown, options.title);
  let html = await convertMarkdownToHtml(sanitizedMd);

  // Injeta ofertas de monetização antes do disclaimer final
  if (options.offers && options.offers.length > 0) {
    html = injectMonetizationBoxes(html, options.offers);
  }

  const isInvestment = options.categorySlug === "investimentos";
  const disclaimer = getLegalDisclaimerHtml(options.language || "pt-BR", isInvestment, {
    blogName: options.blogName,
    niche: options.niche,
    customDisclaimer: options.customDisclaimer,
  });

  if (html.includes("ud-aviso")) {
    // Se for blog específico (ex: British Car Guide ou customizado), substitui qualquer aviso legal genérico ou em português anterior
    if (
      options.customDisclaimer ||
      options.blogName?.toLowerCase().includes("britis") ||
      (options.niche && /car|motoring|automot/i.test(options.niche))
    ) {
      html = html.replace(/<p class="ud-aviso">[\s\S]*?<\/p>/g, disclaimer);
    }
  } else {
    html = `${html}\n\n${disclaimer}`;
  }

  const excerpt = generateExcerpt(options.providedExcerpt || sanitizedMd);

  return { html, excerpt };
}
