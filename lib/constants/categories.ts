/**
 * FONTE DA VERDADE DAS CATEGORIAS DO PORTAL UNIVERSO DO DINHEIRO
 * 
 * Regras estritas:
 * 1. A fonte da verdade técnica é SEMPRE o SLUG.
 * 2. O portal possui exatamente 5 categorias oficiais de Finanças Pessoais.
 * 3. A antiga categoria "Renda e Milhas" (renda-e-milhas) foi descontinuada e substituída por "Milhas e Pontos" (milhas-e-pontos).
 * 4. A categoria "Investimentos" (investimentos) é nova e oficial.
 * 5. NUNCA utilizar ou publicar na categoria "Uncategorized" (slug: uncategorized).
 */

export type OfficialCategorySlug =
  | "emprestimos"
  | "saindo-das-dividas"
  | "cartoes"
  | "investimentos"
  | "milhas-e-pontos";

export interface OfficialCategoryConfig {
  name: string;
  slug: OfficialCategorySlug;
  description: string;
  keywords: string[];
}

export const OFFICIAL_CATEGORIES: OfficialCategoryConfig[] = [
  {
    name: "Empréstimos",
    slug: "emprestimos",
    description: "Crédito consignado, empréstimo pessoal, garantia de imóvel/veículo, fintechs e taxas de juros.",
    keywords: [
      "empréstimo",
      "emprestimo",
      "consignado",
      "crédito",
      "credito",
      "financiamento",
      "fgts",
      "saque-aniversário",
      "fintech",
      "refinanciamento",
      "margem consignável",
    ],
  },
  {
    name: "Saindo das Dívidas",
    slug: "saindo-das-dividas",
    description: "Renegociação de dívidas, orçamento familiar, métodos de quitação, educação financeira e score.",
    keywords: [
      "dívida",
      "divida",
      "dívidas",
      "dividas",
      "sair das dívidas",
      "renegociação",
      "renegociar",
      "orçamento",
      "orcamento",
      "50/30/20",
      "planejamento financeiro",
      "serasa",
      "spc",
      "nome limpo",
      "inadimplência",
      "poupar",
      "reserva de emergência",
    ],
  },
  {
    name: "Cartões de Crédito",
    slug: "cartoes",
    description: "Análises de cartões, limites de crédito, anuidade, benefícios e cartões para negativados ou score baixo.",
    keywords: [
      "cartão",
      "cartao",
      "cartões",
      "cartoes",
      "cartão de crédito",
      "cartao de credito",
      "limite de crédito",
      "anuidade",
      "fatura",
      "cashback",
      "score baixo",
    ],
  },
  {
    name: "Investimentos",
    slug: "investimentos",
    description: "Renda fixa, Tesouro Direto, CDB, LCI, LCA, fundos, rentabilidade consciente e gestão de risco.",
    keywords: [
      "investimento",
      "investimentos",
      "investir",
      "tesouro direto",
      "tesouro selic",
      "cdb",
      "lci",
      "lca",
      "renda fixa",
      "ações",
      "fundos imobiliários",
      "fii",
      "rentabilidade",
      "taxa selic",
      "cdi",
      "poupança",
    ],
  },
  {
    name: "Milhas e Pontos",
    slug: "milhas-e-pontos",
    description: "Programas de fidelidade, acúmulo de milhas aéreas, transferência bonificada e emissão de passagens.",
    keywords: [
      "milhas",
      "milha",
      "pontos",
      "milhas aéreas",
      "programas de fidelidade",
      "livelo",
      "esfera",
      "smiles",
      "latam pass",
      "tudoazul",
      "transferência bonificada",
      "voar de graça",
      "passagens com milhas",
    ],
  },
];

export const ALLOWED_CATEGORY_SLUGS: readonly OfficialCategorySlug[] = [
  "emprestimos",
  "saindo-das-dividas",
  "cartoes",
  "investimentos",
  "milhas-e-pontos",
] as const;

export function isOfficialCategorySlug(slug: string): slug is OfficialCategorySlug {
  return ALLOWED_CATEGORY_SLUGS.includes(slug as OfficialCategorySlug);
}

export function getCategoryBySlug(slug: string): OfficialCategoryConfig | undefined {
  return OFFICIAL_CATEGORIES.find((cat) => cat.slug === slug);
}
