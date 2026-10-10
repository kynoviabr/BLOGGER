import { OFFICIAL_CATEGORIES, OfficialCategorySlug, getCategoryBySlug } from "@/lib/constants/categories";

/**
 * Termos estritamente fora do escopo editorial de Finanças Pessoais.
 * Bloqueiam sumariamente a pauta antes de gastar recursos de geração.
 */
const FORBIDDEN_TOPIC_TERMS = [
  "microsserviço",
  "microsservico",
  "next.js",
  "nextjs",
  "app router",
  "react",
  "node.js",
  "typescript",
  "javascript",
  "programação",
  "programacao",
  "desenvolvimento de software",
  "engenharia de software",
  "devops",
  "cloud computing",
  "docker",
  "kubernetes",
  "agentes de ia",
  "inteligência artificial",
  "inteligencia artificial",
  "deep learning",
  "machine learning",
  "llm",
  "chatgpt",
  "marketing digital",
  "tráfego pago",
  "trafego pago",
  "afiliado digital",
  "dropshipping",
  "criptomoeda duvidosa",
  "jogos de aposta",
  "tigrinho",
  "cassino",
];

export interface ScopeValidationResult {
  isAllowed: boolean;
  reason?: string;
  matchedCategorySlug?: OfficialCategorySlug;
  matchedCategoryName?: string;
}

/**
 * Valida se um tópico está dentro do escopo estrito de finanças pessoais
 * e classifica-o em exatamente UMA das 5 categorias oficiais pelo slug.
 */
export function validateEditorialScope(
  titleOrTopic: string,
  keywords: string[] = []
): ScopeValidationResult {
  const combined = `${titleOrTopic} ${keywords.join(" ")}`.toLowerCase();

  // 1. Verificação de termos proibidos (fora do escopo de finanças pessoais)
  for (const forbidden of FORBIDDEN_TOPIC_TERMS) {
    if (combined.includes(forbidden)) {
      return {
        isAllowed: false,
        reason: `Tema fora do escopo editorial de finanças pessoais (termo bloqueado: "${forbidden}").`,
      };
    }
  }

  // 2. Classificação estrita em uma das 5 categorias oficiais
  let bestSlug: OfficialCategorySlug | null = null;
  let maxMatches = 0;

  for (const cat of OFFICIAL_CATEGORIES) {
    let matches = 0;
    for (const kw of cat.keywords) {
      if (combined.includes(kw)) {
        matches++;
      }
    }
    if (matches > maxMatches) {
      maxMatches = matches;
      bestSlug = cat.slug;
    }
  }

  // Se nenhum termo de palavra-chave deu match, mas fala de finanças em geral:
  if (!bestSlug) {
    return {
      isAllowed: false,
      reason: "O assunto não se enquadra em nenhuma das 5 categorias oficiais de finanças pessoais do portal.",
    };
  }

  const categoryConfig = getCategoryBySlug(bestSlug);

  return {
    isAllowed: true,
    matchedCategorySlug: bestSlug,
    matchedCategoryName: categoryConfig?.name,
  };
}
