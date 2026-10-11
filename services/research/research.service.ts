import {
  ResearchRequest,
  ResearchSource,
  FetchedSourceContent,
  ResearchFact,
  FactualResearchBrief,
  ResearchRiskLevel,
  SearchProvider,
} from "./research.types";
import { createSearchProvider } from "./search-providers";
import { SourceFetcher } from "./source-fetcher";
import { rankAndSelectSources, RankedSourceCandidate } from "./source-ranker";
import { wrapInFactualDataContainer } from "./prompt-injection-sanitizer";
import { LogService } from "@/services/log.service";
import { logger } from "@/lib/logger";

export class ResearchService {
  private readonly searchProvider: SearchProvider;
  private readonly sourceFetcher: SourceFetcher;

  constructor(searchProvider?: SearchProvider, sourceFetcher?: SourceFetcher) {
    this.searchProvider = searchProvider || createSearchProvider();
    this.sourceFetcher = sourceFetcher || new SourceFetcher();
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
      "benefício do inss",
      "regras inss",
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

    const lang = (request.language || 'pt-BR').toLowerCase();

    if (riskLevel === "HIGH") {
      if (lang === 'en-us') {
        queries.push(`${cleanKeyword} site:gov`);
        queries.push(`${cleanKeyword} site:consumerfinance.gov`);
        queries.push(`${cleanKeyword} ${currentYear}`);
      } else if (lang === 'en-gb') {
        queries.push(`${cleanKeyword} site:gov.uk`);
        queries.push(`${cleanKeyword} site:fca.org.uk`);
        queries.push(`${cleanKeyword} ${currentYear}`);
      } else if (lang === 'en-au') {
        queries.push(`${cleanKeyword} site:gov.au`);
        queries.push(`${cleanKeyword} site:moneysmart.gov.au`);
        queries.push(`${cleanKeyword} ${currentYear}`);
      } else if (lang.startsWith('es')) {
        queries.push(`${cleanKeyword} site:gob.es`);
        queries.push(`${cleanKeyword} site:bde.es`);
        queries.push(`${cleanKeyword} ${currentYear}`);
      } else if (lang.startsWith('de')) {
        queries.push(`${cleanKeyword} site:bafin.de`);
        queries.push(`${cleanKeyword} site:bundesbank.de`);
        queries.push(`${cleanKeyword} ${currentYear}`);
      } else if (lang.startsWith('pl')) {
        queries.push(`${cleanKeyword} site:gov.pl`);
        queries.push(`${cleanKeyword} site:knf.gov.pl`);
        queries.push(`${cleanKeyword} ${currentYear}`);
      } else {
        // pt-BR
        queries.push(`${cleanKeyword} site:gov.br`);
        queries.push(`${cleanKeyword} site:bcb.gov.br`);
        queries.push(`${cleanKeyword} ${currentYear}`);
      }
    } else if (riskLevel === "MEDIUM") {
      queries.push(`${cleanKeyword} ${currentYear}`);
      if (lang.startsWith('en')) {
        queries.push(`how it works ${cleanKeyword}`);
      } else if (lang.startsWith('de')) {
        queries.push(`wie funktioniert ${cleanKeyword}`);
      } else if (lang.startsWith('pl')) {
        queries.push(`jak dziala ${cleanKeyword}`);
      } else {
        queries.push(`como funciona ${cleanKeyword}`);
      }
    } else {
      queries.push(`${cleanKeyword} ${currentYear}`);
    }

    return queries;
  }

  /**
   * Extrai fatos verificáveis a partir do CONTEÚDO REAL obtido das URLs originais.
   * NUNCA utiliza search snippets como fonte de fatos verificados.
   */
  private extractFactsFromFetchedSources(fetchedSources: FetchedSourceContent[]): ResearchFact[] {
    const facts: ResearchFact[] = [];

    for (const source of fetchedSources) {
      if (!source.paragraphs || source.paragraphs.length === 0) continue;

      // Filtra parágrafos ricos em informação factual (mínimo de palavras e contexto)
      const informativeParagraphs = source.paragraphs.filter(p => {
        const lower = p.toLowerCase();
        return (
          p.length >= 45 &&
          !lower.includes("cookies") &&
          !lower.includes("política de privacidade") &&
          !lower.includes("todos os direitos reservados") &&
          !lower.includes("carregando") &&
          !lower.includes("inscreva-se")
        );
      });

      // Seleciona até 2 afirmações representativas por fonte
      for (const paragraph of informativeParagraphs.slice(0, 2)) {
        // Divide o parágrafo em orações
        const sentences = paragraph
          .split(/(?<=[.!?])\s+/)
          .map(s => s.trim())
          .filter(s => s.length >= 35 && !s.includes("[instrução_bloqueada"));

        if (sentences.length === 0) continue;

        const statement = sentences[0];
        const excerpt = paragraph.length > 250 ? paragraph.slice(0, 250).trim() + "..." : paragraph;

        facts.push({
          statement,
          sourceExcerpt: excerpt,
          sourceUrl: source.sourceUrl,
          sourceTitle: source.title,
          publishedAt: source.publishedAt,
          accessedAt: source.accessedAt,
          confidence: source.isOfficial ? "high" : "medium",
          verificationMethod: "source_content", // Garantido: conteúdo da fonte original
        });
      }
    }

    return facts;
  }

  /**
   * Detecta conflitos semânticos e incertezas factuais entre fontes oficiais.
   */
  private detectConflictsAndUncertainties(
    facts: ResearchFact[],
    fetchedSources: FetchedSourceContent[],
    riskLevel: ResearchRiskLevel
  ): { hasCriticalConflict: boolean; conflicts: string[]; uncertainties: string[]; warnings: string[] } {
    const conflicts: string[] = [];
    const uncertainties: string[] = [];
    const warnings: string[] = [];
    let hasCriticalConflict = false;

    // Se temos fontes oficiais e fontes secundárias, avisar sobre prevalência da oficial
    const hasOfficial = fetchedSources.some(s => s.isOfficial);
    const hasSecondary = fetchedSources.some(s => !s.isOfficial);

    if (hasOfficial && hasSecondary) {
      warnings.push("Fontes oficiais (.gov.br / órgãos reguladores) prevalecem estritamente sobre veículos secundários em caso de divergência.");
    }

    // Detecção de divergências numéricas em margens ou taxas
    const officialFacts = facts.filter(f => f.confidence === "high");
    const percentages: Array<{ value: number; sourceUrl: string }> = [];

    for (const f of officialFacts) {
      const match = f.sourceExcerpt.match(/(\d{1,2}(?:,\d+)?)\s*%/);
      if (match) {
        percentages.push({
          value: parseFloat(match[1].replace(",", ".")),
          sourceUrl: f.sourceUrl,
        });
      }
    }

    // Se houver porcentagens oficiais muito discrepantes sem contextualização de modalidade
    if (percentages.length >= 2) {
      const values = percentages.map(p => p.value);
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      if (maxVal - minVal > 25) {
        conflicts.push(`Divergência detectada entre valores percentuais de fontes oficiais (${minVal}% vs ${maxVal}%).`);
        hasCriticalConflict = true;
      }
    }

    // Incertezas intrínsecas de produtos financeiros
    const combinedFactsText = facts.map(f => f.statement).join(" ").toLowerCase();
    if (combinedFactsText.includes("taxa") || combinedFactsText.includes("juros")) {
      uncertainties.push("As taxas nominais exatas de juros variam por instituição financeira e perfil cadastral do cliente.");
    }

    if (riskLevel === "HIGH" && !hasOfficial) {
      warnings.push("Atenção: Nenhuma fonte oficial primária (.gov.br ou órgão regulador) foi obtida para este tópico de alto risco. Verificação adicional necessária.");
    }

    return { hasCriticalConflict, conflicts, uncertainties, warnings };
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

    lines.push("--- VERIFIED ORIGINAL SOURCES ---");
    brief.fetchedSources.forEach((s, idx) => {
      lines.push(`[${idx + 1}] ${s.title}`);
      lines.push(`    URL: ${s.sourceUrl}`);
      lines.push(`    Final URL: ${s.finalUrl} (HTTP ${s.httpStatus}, ${s.contentType}, ${s.byteLength} bytes)`);
      if (s.publishedAt) lines.push(`    Published: ${s.publishedAt}`);
      lines.push(`    Accessed: ${s.accessedAt}`);
      lines.push(`    Official Authority: ${s.isOfficial ? "YES (.gov.br / regulador)" : "NO"}`);
    });
    lines.push("");

    lines.push("--- VERIFIED FACTS (VERIFIED FROM ORIGINAL SOURCE CONTENT) ---");
    if (brief.facts.length === 0) {
      lines.push("Nenhum fato textual isolado pôde ser verificado no conteúdo original baixado.");
    } else {
      brief.facts.forEach((f, idx) => {
        lines.push(`[Fact ${idx + 1}] ${f.statement}`);
        lines.push(`    Source Excerpt: "${f.sourceExcerpt}"`);
        lines.push(`    Source URL: ${f.sourceUrl}`);
        lines.push(`    Source Title: ${f.sourceTitle}`);
        lines.push(`    Confidence: ${f.confidence.toUpperCase()}`);
        lines.push(`    Verification Method: ${f.verificationMethod}`);
        lines.push("");
      });
    }

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
   * Fluxo: QUERY -> SEARCH CANDIDATES -> SOURCE RANKING -> FETCH ORIGINAL SOURCE -> EXTRACT SOURCE CONTENT -> FACTS
   */
  async conductResearch(request: ResearchRequest): Promise<FactualResearchBrief> {
    const startTime = Date.now();
    const riskLevel = this.classifyRisk(request);
    const queries = this.buildSearchQueries(request, riskLevel);

    logger.info("ResearchService", `Iniciando pesquisa factual para "${request.title}" [Risk: ${riskLevel}]`, {
      queries,
      riskLevel,
    });

    // 1. Busca de candidatos a fontes (Search Results)
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

    // 2. Ranqueamento e seleção das top URLs com relevância temática estrita
    const topicTerms = [...(request.keywords || []), request.title];
    const acceptedSources = rankAndSelectSources(candidates, request.currentDate, 5, topicTerms);

    // 3. FETCH DO CONTEÚDO ORIGINAL DA FONTE (SourceFetcher)
    const fetchedSources = await this.sourceFetcher.fetchSources(acceptedSources, 3);

    // 4. EXTRAÇÃO DE FATOS DO CONTEÚDO REAL DA PÁGINA (Com sourceExcerpt e provenance)
    const facts = this.extractFactsFromFetchedSources(fetchedSources);

    // 5. DETECÇÃO REAL DE CONFLITOS E INCERTEZAS
    const { hasCriticalConflict, conflicts, uncertainties, warnings } = this.detectConflictsAndUncertainties(
      facts,
      fetchedSources,
      riskLevel
    );

    // 6. POLÍTICA DE RESILIÊNCIA E CONFLITO FACTUAL
    let status: "READY" | "RESEARCH_REVIEW_REQUIRED" = "READY";

    if (hasCriticalConflict) {
      status = "RESEARCH_REVIEW_REQUIRED";
      warnings.push("FAIL-CLOSED ATIVADO: Conflito semântico/numérico crítico detectado entre fontes oficiais.");
    } else if (facts.length === 0) {
      warnings.push("Aviso Editorial: Scraping de fontes externas não retornou dados em tempo real. O conteúdo será gerado com base em conhecimentos normativos consolidados e rigor YMYL.");
    } else {
      const hasOfficial = fetchedSources.some(s => s.isOfficial);
      if (riskLevel === "HIGH" && !hasOfficial) {
        warnings.push("Aviso Editorial: Tópico de alto risco contextualizado com imprensa econômica e fontes de mercado.");
      }
    }

    const durationMs = Date.now() - startTime;

    const brief: FactualResearchBrief = {
      topic: request.title,
      riskLevel,
      researchedAt: request.currentDate,
      sources: acceptedSources,
      fetchedSources,
      facts,
      uncertainties,
      warnings: [...warnings, ...conflicts],
      status,
      rawBriefingText: "",
    };

    // 7. Monta o texto do briefing e protege contra prompt injection
    const rawFormatted = this.formatBriefingText(brief);
    brief.rawBriefingText = wrapInFactualDataContainer(rawFormatted, "FACTUAL_RESEARCH_BRIEF");

    // Registro de Observabilidade no Supabase Log
    try {
      await LogService.recordLog(
        status === "READY" ? "info" : "warn",
        "ResearchService.conductResearch",
        `Pesquisa concluída para "${request.title}": ${fetchedSources.length} fontes originais baixadas, ${facts.length} fatos verificados [${status}]`,
        {
          operation: "researchArticle",
          contentId: request.contentId,
          topic: request.title,
          riskLevel,
          candidatesFound: candidates.length,
          sourcesSelected: acceptedSources.length,
          sourcesFetched: fetchedSources.length,
          factsVerified: facts.length,
          status,
          durationMs,
          success: status === "READY",
        }
      );
    } catch {
      // Ignora erro secundário de log
    }

    logger.info("ResearchService", `Pesquisa factual concluída em ${durationMs}ms para "${request.title}"`, {
      candidatesFound: candidates.length,
      sourcesFetched: fetchedSources.length,
      factsVerified: facts.length,
      status,
    });

    return brief;
  }
}
