import { ResearchSource, SourceType } from "./research.types";

export interface RankedSourceCandidate {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

// Domínios TIER 1 — Fontes Oficiais e Regulatórias Primárias
const TIER_1_DOMAINS = [
  "gov.br",
  "bcb.gov.br",
  "receita.fazenda.gov.br",
  "inss.gov.br",
  "mte.gov.br",
  "tesourotransparente.gov.br",
  "cvm.gov.br",
  "caixa.gov.br",
  "bb.com.br",
  "planalto.gov.br",
  "camara.leg.br",
  "senado.leg.br",
];

// Domínios TIER 2 — Institucionais e Entidades do Sistema Financeiro
const TIER_2_DOMAINS = [
  "febraban.org.br",
  "anbima.com.br",
  "serasa.com.br",
  "spcbrasil.org.br",
  "sebrae.com.br",
  "itau.com.br",
  "bradesco.com.br",
  "santander.com.br",
  "nubank.com.br",
  "inter.co",
];

// Domínios TIER 3 — Imprensa Especializada e Veículos de Alta Reputação
const TIER_3_DOMAINS = [
  "valor.globo.com",
  "infomoney.com.br",
  "exame.com",
  "g1.globo.com",
  "folha.uol.com.br",
  "estadao.com.br",
  "cnnbrasil.com.br",
  "uol.com.br",
  "bbc.com",
  "reuters.com",
];

export function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Classifica o Tier e tipo da fonte sem limitar cegamente a uma whitelist estática.
 */
export function classifySourceTier(domain: string): { tier: 1 | 2 | 3 | 4; sourceType: SourceType; reason: string } {
  // Qualquer domínio governamental oficial (.gov.br, .leg.br, .jus.br) é Tier 1
  if (domain.endsWith(".gov.br") || domain.endsWith(".leg.br") || domain.endsWith(".jus.br") || TIER_1_DOMAINS.some(d => domain === d || domain.endsWith("." + d))) {
    return {
      tier: 1,
      sourceType: "official",
      reason: "Fonte oficial governamental ou órgão regulador primário do Brasil",
    };
  }

  // Tier 2: Institucional / Financeiro
  if (TIER_2_DOMAINS.some(d => domain === d || domain.endsWith("." + d))) {
    return {
      tier: 2,
      sourceType: "institutional",
      reason: "Entidade institucional, associação setorial ou banco emissor",
    };
  }

  // Tier 3: Imprensa reputada
  if (TIER_3_DOMAINS.some(d => domain === d || domain.endsWith("." + d))) {
    return {
      tier: 3,
      sourceType: "news",
      reason: "Veículo de imprensa ou jornalismo financeiro reconhecido",
    };
  }

  // Tier 4: Fontes secundárias / blogs
  return {
    tier: 4,
    sourceType: "secondary",
    reason: "Fonte secundária de mercado / portal temático",
  };
}

/**
 * Avalia e pontua fontes com base em Hierarquia de Tier, Freshness e Relevância.
 */
export function rankAndSelectSources(
  candidates: RankedSourceCandidate[],
  currentDate: string,
  maxSources = 5,
  topicKeywords: string[] = []
): ResearchSource[] {
  const currentYear = parseInt(currentDate.split("-")[0], 10);
  const accessedAt = new Date().toISOString();

  // Deduplicação por domínio e URL
  const seenUrls = new Set<string>();
  const scoredSources: Array<{ source: ResearchSource; score: number }> = [];

  const normalizedKeywords = topicKeywords
    .flatMap(k => k.toLowerCase().split(/\s+/))
    .filter(k => k.length >= 4);

  for (const item of candidates) {
    if (!item.url || seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);

    const domain = extractDomain(item.url);
    if (!domain) continue;

    const classification = classifySourceTier(domain);

    // Pontuação base pelo Tier
    // Tier 1: 100 pontos, Tier 2: 70 pontos, Tier 3: 40 pontos, Tier 4: 10 pontos
    let score = (5 - classification.tier) * 25;

    const textToCheck = (item.title + " " + item.snippet + " " + item.url).toLowerCase();

    // Relevância temática estrita: pontua aderência aos termos da pauta
    if (normalizedKeywords.length > 0) {
      const matchCount = normalizedKeywords.filter(k => textToCheck.includes(k)).length;
      if (matchCount > 0) {
        score += Math.min(matchCount * 15, 45); // Bônus de relevância temática
      } else {
        score -= 50; // Penalidade forte para páginas sem aderência ao tema da pauta
      }
    }

    // Bônus de Freshness temporal
    if (textToCheck.includes(String(currentYear))) {
      score += 15; // Menção expressa ao ano corrente
    } else if (textToCheck.includes(String(currentYear - 1))) {
      score += 5; // Menção ao ano anterior
    }

    // Penalidade para anos anacrônicos muito antigos (ex: 2022 ou anterior)
    if (/\b(201\d|202[0-2])\b/.test(textToCheck)) {
      score -= 30;
    }

    scoredSources.push({
      score,
      source: {
        title: item.title.trim(),
        url: item.url.trim(),
        domain,
        publisher: domain,
        publishedAt: item.publishedAt,
        accessedAt,
        sourceType: classification.sourceType,
        tier: classification.tier,
        selectionReason: `${classification.reason} (Score: ${score})`,
      },
    });
  }

  // Ordenar decrescente por score
  scoredSources.sort((a, b) => b.score - a.score);

  return scoredSources.slice(0, maxSources).map(s => s.source);
}
