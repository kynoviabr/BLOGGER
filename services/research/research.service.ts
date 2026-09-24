import {
  ResearchRequest,
  ResearchSource,
  ResearchFact,
  FactualResearchBrief,
  ResearchRiskLevel,
  SearchProvider,
} from "./research.types";
import { createSearchProvider } from "./search-providers";
import { rankAndSelectSources, RankedSourceCandidate } from "./source-ranker";
import { wrapInFactualDataContainer, sanitizeUntrustedText } from "./prompt-injection-sanitizer";
import { LogService } from "@/services/log.service";
import { logger } from "@/lib/logger";

export class ResearchService {
  private readonly searchProvider: SearchProvider;

  constructor(searchProvider?: SearchProvider) {
    this.searchProvider = searchProvider || createSearchProvider();
  }

  /**
   * Classifica o nível de risco factual da pauta: LOW, MEDIUM ou HIGH.
   */
  classifyRisk(request: ResearchRequest): ResearchRiskLevel {
    const text = `${request.title} ${request.category || ""} ${(request.keywords || []).join(" ")}`.toLowerCase();

    // Palavras-chave de ALTO RISCO (YMYL regulatório, leis, taxas oficiais, consignado, margens, tributos)
    const highRiskTerms = [
      "consignado",
      "margem",
      "inss",
      "legislação",
      "lei ",
      "decreto",
      "norma",
      "regulamenta",
      "taxa selic",
      "teto de juros",
      "imposto de renda",
      "receita federal",
      "restituição",
      "banco central",
      "fgts",
      "pis",
      "pasep",
      "benefício",
      "direitos",
      "regras atuais",
      "2026",
    ];

    if (highRiskTerms.some(term => text.includes(term))) {
      return "HIGH";
    }

    // Palavras-chave de MÉDIO RISCO (produtos comerciais, empréstimos em geral, cartões, financiamentos)
    const mediumRiskTerms = [
      "empréstimo",
      "financiamento",
      "cartão de crédito",
      "score",
      "serasa",
      "portabilidade",
      "juros",
      "investimento",
      "cdb",
      "poupança",
      "banco",
      "crédito",
    ];

    if (mediumRiskTerms.some(term => text.includes(term))) {
      return "MEDIUM";
    }

    return "LOW";
  }

  /**
   * Constrói queries de busca especializadas com base na pauta e nível de risco.
   */
  buildSearchQueries(request: ResearchRequest, riskLevel: ResearchRiskLevel): string[] {
    const currentYear = request.currentDate.split("-")[0];
    const queries: string[] = [];

    // Prioriza keywords fornecidas ou extrai o núcleo temático
    const topicParts = request.title.split(/[:?–—-]/);
    const fallbackCore = (topicParts[0] || request.title).trim();
    const primaryTerm = (request.keywords && request.keywords.length > 0)
      ? request.keywords[0]
      : fallbackCore;

    const cleanKeyword = primaryTerm
      .replace(/[?:!,"'“”()[\]{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (riskLevel === "HIGH") {
      // Query 1: Focada em portais governamentais e normativos oficiais (.gov.br)
      queries.push(`${cleanKeyword} site:gov.br`);
      // Query 2: Focada no Banco Central / órgãos reguladores
      queries.push(`${cleanKeyword} site:bcb.gov.br`);
      // Query 3: Busca por regras da keyword secundária se presente
      if (request.keywords && request.keywords.length > 1) {
        const cleanSecondary = request.keywords[1].replace(/[?:!,"'“”()[\]{}]/g, " ").trim();
        queries.push(`${cleanSecondary} site:gov.br`);
      }
    } else if (riskLevel === "MEDIUM") {
      queries.push(`${cleanKeyword} ${currentYear}`);
      queries.push(`como funciona ${cleanKeyword}`);
    } else {
      queries.push(`${cleanKeyword} ${currentYear}`);
    }

    return queries;
  }

  /**
   * Extrai fatos verificáveis e objetivos dos snippets de fontes selecionadas.
   */
  private extractFacts(sources: ResearchSource[], rawCandidates: RankedSourceCandidate[]): ResearchFact[] {
    const facts: ResearchFact[] = [];
    const snippetMap = new Map<string, string>();
    rawCandidates.forEach(c => snippetMap.set(c.url, c.snippet));

    for (const source of sources) {
      const snippet = snippetMap.get(source.url);
      if (!snippet || snippet.length < 20) continue;

      // Sanitiza e divide em orações informativas
      const cleanSnippet = sanitizeUntrustedText(snippet);
      const sentences = cleanSnippet
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length >= 25 && !s.includes("[instrução_bloqueada"));

      for (const sentence of sentences.slice(0, 2)) {
        facts.push({
          statement: sentence,
          sourceUrl: source.url,
          sourceTitle: source.title,
          publishedAt: source.publishedAt,
          confidence: source.tier <= 2 ? "high" : "medium",
        });
      }
    }

    return facts;
  }

  /**
   * Detecta incertezas e divergências factuais entre fontes.
   */
  private detectUncertainties(facts: ResearchFact[], sources: ResearchSource[], riskLevel: ResearchRiskLevel): { uncertainties: string[]; warnings: string[] } {
    const uncertainties: string[] = [];
    const warnings: string[] = [];

    // Se temos fontes oficiais e fontes secundárias, avisar sobre prevalência da oficial
    const hasOfficial = sources.some(s => s.tier === 1);
    const hasSecondary = sources.some(s => s.tier >= 3);

    if (hasOfficial && hasSecondary) {
      warnings.push("Fontes secundárias e veículos jornalísticos devem ter suas afirmações estritamente validadas contra as fontes oficiais prioritárias (.gov.br / BCB).");
    }

    // Verificar se há menções a regras que dependem de confirmação individual
    const combinedFactsText = facts.map(f => f.statement).join(" ").toLowerCase();
    if (combinedFactsText.includes("taxa") || combinedFactsText.includes("juros")) {
      uncertainties.push("As taxas nominais exatas de juros variam por instituição financeira e perfil cadastral do cliente.");
    }

    if (riskLevel === "HIGH" && !hasOfficial) {
      warnings.push("Atenção: Nenhuma fonte oficial primária (.gov.br ou órgão regulador) foi localizada para este tópico de alto risco. Verificação adicional necessária.");
    }

    return { uncertainties, warnings };
  }

  /**
   * Converte o briefing estruturado em texto formatado para injeção em sourcesOrResearch.
   */
  formatBriefingText(brief: FactualResearchBrief): string {
    const lines: string[] = [];

    lines.push(`TOPIC: ${brief.topic}`);
    lines.push(`RESEARCHED AT: ${brief.researchedAt}`);
    lines.push(`RISK LEVEL: ${brief.riskLevel}`);
    lines.push(`STATUS: ${brief.status}`);
    lines.push("");

    lines.push("--- VERIFIED SOURCES ---");
    brief.sources.forEach((s, idx) => {
      lines.push(`[${idx + 1}] ${s.title}`);
      lines.push(`    Domain: ${s.domain} (Tier ${s.tier} - ${s.sourceType.toUpperCase()})`);
      lines.push(`    URL: ${s.url}`);
      if (s.publishedAt) lines.push(`    Published: ${s.publishedAt}`);
      lines.push(`    Reason: ${s.selectionReason}`);
    });
    lines.push("");

    lines.push("--- VERIFIED FACTS ---");
    if (brief.facts.length === 0) {
      lines.push("Nenhum fato textual isolado extraído. Utilizar as fontes de referência com cautela.");
    } else {
      brief.facts.forEach((f, idx) => {
        lines.push(`${idx + 1}. ${f.statement}`);
        lines.push(`   [Fonte: ${f.sourceTitle} | URL: ${f.sourceUrl} | Confiança: ${f.confidence}]`);
      });
    }
    lines.push("");

    if (brief.uncertainties.length > 0) {
      lines.push("--- UNCERTAINTIES & VARIABILITY ---");
      brief.uncertainties.forEach(u => lines.push(`- ${u}`));
      lines.push("");
    }

    if (brief.warnings.length > 0) {
      lines.push("--- EDITORIAL WARNINGS ---");
      brief.warnings.forEach(w => lines.push(`- ${w}`));
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Executa a esteira de pesquisa factual completa para a pauta.
   */
  async conductResearch(request: ResearchRequest): Promise<FactualResearchBrief> {
    const startTime = Date.now();
    const riskLevel = this.classifyRisk(request);
    const queries = this.buildSearchQueries(request, riskLevel);

    logger.info("ResearchService", `Iniciando pesquisa factual para "${request.title}" [Risk: ${riskLevel}]`, {
      queries,
      riskLevel,
    });

    const candidates: RankedSourceCandidate[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 600));
      }
      try {
        const results = await this.searchProvider.search(q, { limit: 6 });
        for (const r of results) {
          if (!seenUrls.has(r.url)) {
            seenUrls.add(r.url);
            candidates.push(r);
          }
        }
      } catch (err) {
        logger.warn("ResearchService", `Falha na query "${q}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Ranqueamento e seleção das top fontes
    const acceptedSources = rankAndSelectSources(candidates, request.currentDate, 5);

    // Extração de fatos das fontes aceitas
    const facts = this.extractFacts(acceptedSources, candidates);

    // Detecção de incertezas e conflitos
    const { uncertainties, warnings } = this.detectUncertainties(facts, acceptedSources, riskLevel);

    // Política de Fail-Closed para High Risk
    // Se o risco for HIGH e não houver nenhuma fonte confiável (Tier 1 ou 2) OU se nenhuma fonte foi encontrada:
    let status: "READY" | "RESEARCH_REVIEW_REQUIRED" = "READY";
    const hasReliableSource = acceptedSources.some(s => s.tier <= 2);

    if (riskLevel === "HIGH" && (!hasReliableSource || acceptedSources.length === 0)) {
      status = "RESEARCH_REVIEW_REQUIRED";
      warnings.push("FAIL-CLOSED ATIVADO: Não foi possível verificar informações críticas desta pauta em fontes oficiais primárias.");
    }

    const durationMs = Date.now() - startTime;

    const brief: FactualResearchBrief = {
      topic: request.title,
      riskLevel,
      researchedAt: request.currentDate,
      sources: acceptedSources,
      facts,
      uncertainties,
      warnings,
      status,
      rawBriefingText: "",
    };

    // Monta o texto do briefing e protege contra prompt injection
    const rawFormatted = this.formatBriefingText(brief);
    brief.rawBriefingText = wrapInFactualDataContainer(rawFormatted, "FACTUAL_RESEARCH_BRIEF");

    // Registro de Observabilidade no Supabase Log
    try {
      await LogService.recordLog(
        status === "READY" ? "info" : "warn",
        "ResearchService.conductResearch",
        `Pesquisa concluída para "${request.title}": ${acceptedSources.length} fontes aceitas [${status}]`,
        {
          operation: "researchArticle",
          contentId: request.contentId,
          topic: request.title,
          riskLevel,
          sourcesFound: candidates.length,
          sourcesAccepted: acceptedSources.length,
          status,
          durationMs,
          success: status === "READY",
        }
      );
    } catch {
      // Ignora erro secundário de log
    }

    logger.info("ResearchService", `Pesquisa factual concluída em ${durationMs}ms para "${request.title}"`, {
      sourcesFound: candidates.length,
      sourcesAccepted: acceptedSources.length,
      status,
    });

    return brief;
  }
}
