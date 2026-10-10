import { marked } from "marked";

export interface FormattedContentResult {
  html: string;
  excerpt: string;
}

export const OFFICIAL_LEGAL_DISCLAIMER_HTML =
  '<p class="ud-aviso"><strong>Aviso:</strong> conteúdo informativo, não é recomendação financeira. Taxas e regras mudam; confirme nos canais oficiais das instituições.</p>';

export const INVESTMENT_RISK_DISCLAIMER_HTML =
  '<p class="ud-aviso"><strong>Aviso:</strong> conteúdo informativo, não é recomendação financeira. Investimentos envolvem riscos e rentabilidade passada não garante resultados futuros. Confirme prazos e taxas nos canais oficiais.</p>';

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
  }
): Promise<FormattedContentResult> {
  const sanitizedMd = sanitizeMarkdown(rawMarkdown, options.title);
  let html = await convertMarkdownToHtml(sanitizedMd);

  const isInvestment = options.categorySlug === "investimentos";
  const disclaimer = isInvestment ? INVESTMENT_RISK_DISCLAIMER_HTML : OFFICIAL_LEGAL_DISCLAIMER_HTML;

  if (!html.includes("ud-aviso")) {
    html = `${html}\n\n${disclaimer}`;
  }

  const excerpt = generateExcerpt(options.providedExcerpt || sanitizedMd);

  return { html, excerpt };
}
