import { OFFICIAL_CATEGORIES, OfficialCategorySlug, getCategoryBySlug } from "@/lib/constants/categories";

/**
 * Termos universalmente proibidos em qualquer nicho (apostas, cassinos, fraudes, esquemas).
 */
const UNIVERSAL_FORBIDDEN_TERMS = [
  "jogos de aposta",
  "tigrinho",
  "cassino online",
  "cassino",
  "roleta online",
  "apostas esportivas",
  "esquema ponzi",
  "piramide financeira",
  "criptomoeda duvidosa",
  "dropshipping suspeito",
];

/**
 * Termos fora de escopo exclusivamente para blogs de Finanças Pessoais (Universo do Dinheiro).
 */
const FORBIDDEN_FINANCE_TOPIC_TERMS = [
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
  "marketing digital",
  "tráfego pago",
  "trafego pago",
  "afiliado digital",
  "inteligência artificial",
  "inteligencia artificial",
  "agentes de ia",
  "chatgpt",
  "llm",
];

const MULTILINGUAL_CATEGORY_KEYWORDS: Record<OfficialCategorySlug, string[]> = {
  emprestimos: [
    'loan', 'loans', 'borrow', 'borrowing', 'mortgage', 'refinance', 'lending',
    'kredit', 'kredite', 'baudarlehen', 'finanzierung',
    'prestamo', 'prestamos', 'hipoteca', 'credito',
    'pozyczka', 'pozyczki', 'kredyt', 'kredyty', 'chwilowka'
  ],
  'saindo-das-dividas': [
    'debt', 'debts', 'payoff', 'snowball', 'avalanche', 'budget', 'budgeting', 'financial planning',
    'schulden', 'tilgung', 'haushaltsbuch', 'finanzplanung', 'sparen',
    'deuda', 'deudas', 'morosidad', 'presupuesto', 'ahorro',
    'dlug', 'dlugi', 'zadluzenie', 'budzet', 'oszczedzanie'
  ],
  cartoes: [
    'credit card', 'credit cards', 'rewards card', 'cashback card', 'annual fee',
    'kreditkarte', 'kreditkarten', 'bargeldlos',
    'tarjeta de credito', 'tarjetas de credito', 'tarjeta bancaria',
    'karta kredytowa', 'karty kredytowe', 'karta platnicza'
  ],
  investimentos: [
    'invest', 'investing', 'investment', 'investments', 'stocks', 'etf', 'index fund', 'compound interest',
    'geldanlage', 'aktien', 'fonds', 'tagesgeld', 'festgeld', 'zinsen',
    'inversion', 'inversiones', 'invertir', 'bolsa', 'plazo fijo',
    'inwestowanie', 'inwestycje', 'akcje', 'lokata', 'obligacje'
  ],
  'milhas-e-pontos': [
    'miles', 'airline miles', 'travel points', 'credit card points', 'loyalty program',
    'meilen', 'vielflieger', 'punkte', 'bonusprogramm',
    'millas', 'puntos', 'viajero frecuente', 'recompensas',
    'mile', 'punkty', 'program lojalnosciowy'
  ],
};

export interface ScopeValidationOptions {
  blog?: {
    id?: string;
    name?: string;
    niche?: string | null;
    slug?: string;
  } | null;
  calendarCategory?: {
    id?: string;
    name?: string;
    slug?: string;
  } | null;
  availableCategories?: Array<{
    id?: string;
    name?: string;
    slug?: string;
  }>;
}

export interface ScopeValidationResult {
  isAllowed: boolean;
  reason?: string;
  matchedCategorySlug?: string;
  matchedCategoryName?: string;
}

/**
 * Valida se um tópico está dentro do escopo editorial permitido para o blog em questão.
 * Respeita dinamicamente as categorias e o nicho de blogs customizados (ex: automotivo, tech, educação),
 * aplicando regras estritas de finanças apenas ao portal de Finanças Pessoais.
 */
export function validateEditorialScope(
  titleOrTopic: string,
  keywords: string[] = [],
  options?: ScopeValidationOptions
): ScopeValidationResult {
  const combined = `${titleOrTopic} ${keywords.join(" ")}`.toLowerCase();

  // 1. Verificação universal de termos ilícitos/golpes (bloqueio em qualquer nicho)
  for (const forbidden of UNIVERSAL_FORBIDDEN_TERMS) {
    if (combined.includes(forbidden)) {
      return {
        isAllowed: false,
        reason: `Tema bloqueado por conter termos ilícitos ou de apostas/fraude ("${forbidden}").`,
      };
    }
  }

  // 2. Se a pauta já tiver uma categoria explícita associada (ex: MOT & Maintenance),
  // e pertencer a um blog com essa categoria cadastrada: PERMITIDO!
  if (options?.calendarCategory?.slug || options?.calendarCategory?.name) {
    return {
      isAllowed: true,
      matchedCategorySlug: options.calendarCategory.slug || options.calendarCategory.name?.toLowerCase().replace(/\s+/g, '-'),
      matchedCategoryName: options.calendarCategory.name || options.calendarCategory.slug,
    };
  }

  // 3. Se categorias do blog foram fornecidas, busca correspondência semântica nelas
  if (options?.availableCategories && options.availableCategories.length > 0) {
    for (const cat of options.availableCategories) {
      const normName = (cat.name || '').toLowerCase();
      const normSlug = (cat.slug || '').toLowerCase().replace(/-/g, ' ');

      if (normName && combined.includes(normName)) {
        return {
          isAllowed: true,
          matchedCategorySlug: cat.slug,
          matchedCategoryName: cat.name,
        };
      }
      if (normSlug && combined.includes(normSlug)) {
        return {
          isAllowed: true,
          matchedCategorySlug: cat.slug,
          matchedCategoryName: cat.name,
        };
      }
    }

    // Se o blog não for financeiro e não houve match direto, utiliza a primeira categoria
    const bNiche = (options?.blog?.niche || '').toLowerCase();
    const bSlug = (options?.blog?.slug || '').toLowerCase();
    const isFinBlog = bSlug.includes('dinheiro') || bSlug.includes('finan') || bNiche.includes('finan') || !options?.blog;

    if (!isFinBlog) {
      const firstCategory = options.availableCategories[0];
      return {
        isAllowed: true,
        matchedCategorySlug: firstCategory.slug,
        matchedCategoryName: firstCategory.name,
      };
    }
  }

  // 4. Se for o blog de Finanças Pessoais (ou nicho financeiro):
  const blogNiche = (options?.blog?.niche || '').toLowerCase();
  const blogSlug = (options?.blog?.slug || '').toLowerCase();
  const isFinanceBlog = blogSlug.includes('dinheiro') || blogSlug.includes('finan') || blogNiche.includes('finan') || !options?.blog;

  if (isFinanceBlog) {
    // Verificação de termos proibidos fora do escopo de finanças
    for (const forbidden of FORBIDDEN_FINANCE_TOPIC_TERMS) {
      if (combined.includes(forbidden)) {
        return {
          isAllowed: false,
          reason: `Tema fora do escopo editorial de finanças pessoais (termo bloqueado: "${forbidden}").`,
        };
      }
    }

    // Classificação em uma das 5 categorias financeiras oficiais
    let bestSlug: OfficialCategorySlug | null = null;
    let maxMatches = 0;

    for (const cat of OFFICIAL_CATEGORIES) {
      let matches = 0;
      const allKeywords = [...cat.keywords, ...(MULTILINGUAL_CATEGORY_KEYWORDS[cat.slug] || [])];
      for (const kw of allKeywords) {
        if (combined.includes(kw)) {
          matches++;
        }
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        bestSlug = cat.slug;
      }
    }

    if (bestSlug) {
      const categoryConfig = getCategoryBySlug(bestSlug);
      return {
        isAllowed: true,
        matchedCategorySlug: bestSlug,
        matchedCategoryName: categoryConfig?.name,
      };
    }

    // Se for finanças gerais sem termo específico
    return {
      isAllowed: true,
      matchedCategorySlug: 'saindo-das-dividas',
      matchedCategoryName: 'Finanças Gerais',
    };
  }

  // 5. Para qualquer outro blog (ex: Britisg Car Guide, Tech & AI Insights, Educaly):
  // O tema é permitido!
  return {
    isAllowed: true,
    matchedCategorySlug: 'geral',
    matchedCategoryName: 'Geral',
  };
}
