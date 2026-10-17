/**
 * Utilitário de Geração de Schema JSON-LD (Rank Math & Schema.org)
 * e Otimização Estrita de Metadados Mobile para Google Search.
 */

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Extrai pares de Perguntas e Respostas de uma seção de FAQ no conteúdo (Markdown ou HTML).
 */
export function extractFaqItems(content: string): FaqItem[] {
  if (!content) return [];

  const items: FaqItem[] = [];

  // 1. Procura pela seção de Perguntas Frequentes / FAQ
  const faqSectionRegex = /(?:^|\n)##\s+(?:Perguntas Frequentes|FAQ|Dúvidas Frequentes|Perguntas Comuns)[\s\S]*?(?=(?:^|\n)##\s+|$)/i;
  const sectionMatch = content.match(faqSectionRegex);
  const faqText = sectionMatch ? sectionMatch[0] : content;

  // 2. Extrai cada pergunta (### Pergunta ou **Pergunta:**) e sua respectiva resposta
  const questionRegex = /(?:^|\n)###\s+(?:(?:\d+[\.\)]\s*)?)([^\n?]+(?:\?)?)\n+([\s\S]*?)(?=(?:^|\n)###|\n\s*---\s*\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = questionRegex.exec(faqText)) !== null) {
    const rawQuestion = match[1].replace(/[*_#]/g, '').trim();
    let rawAnswer = match[2]
      .replace(/^>\s*/gm, '') // remove blockquotes se houver
      .replace(/\n{2,}/g, ' ')
      .trim();

    // Remove disclaimers ou links internos acidentais no fim da resposta
    rawAnswer = rawAnswer.split('\n')[0].trim();

    if (rawQuestion.length > 5 && rawAnswer.length > 10) {
      items.push({
        question: rawQuestion,
        answer: rawAnswer,
      });
    }
  }

  // Fallback para padrão em negrito: **1. Pergunta?** ou **Pergunta:**
  if (items.length === 0) {
    const boldRegex = /(?:^|\n)\*\*(?:\d+[\.\)]\s*)?([^\*?]+(?:\?)?)\*\*:?\s*([^\n]+)/g;
    let boldMatch: RegExpExecArray | null;
    while ((boldMatch = boldRegex.exec(faqText)) !== null) {
      const q = boldMatch[1].trim();
      const a = boldMatch[2].trim();
      if (q.length > 5 && a.length > 10 && !q.toLowerCase().includes('resumo executivo')) {
        items.push({ question: q, answer: a });
      }
    }
  }

  return items;
}

/**
 * Constrói o objeto Schema.org FAQPage em conformidade com o Google Rich Results.
 */
export function buildFaqPageSchemaJson(items: FaqItem[]): Record<string, unknown> | null {
  if (!items || items.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/**
 * Converte o Schema FAQPage em script HTML <script type="application/ld+json">.
 */
export function buildFaqPageSchemaScript(items: FaqItem[]): string {
  const schema = buildFaqPageSchemaJson(items);
  if (!schema) return '';

  return `<!-- SCHEMA_FAQ_START -->\n<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>\n<!-- SCHEMA_FAQ_END -->`;
}

/**
 * Otimiza títulos para evitar truncamento no Google Mobile (máximo 60-65 caracteres).
 * Corta respeitando palavras inteiras.
 */
export function optimizeTitleForMobile(title: string, maxLen = 65): string {
  if (!title) return '';
  const clean = title.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;

  const truncated = clean.slice(0, maxLen - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim() + '...';
}

/**
 * Otimiza a Meta Description para o padrão estrito de 140 a 155 caracteres.
 */
export function optimizeMetaDescription(desc: string, minChars = 140, maxChars = 155): string {
  if (!desc) return '';
  let clean = desc
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_~`|\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= maxChars && clean.length >= minChars) {
    return clean;
  }

  if (clean.length > maxChars) {
    const truncated = clean.slice(0, maxChars - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > minChars - 10 ? truncated.slice(0, lastSpace) : truncated).trim() + '...';
  }

  return clean;
}
