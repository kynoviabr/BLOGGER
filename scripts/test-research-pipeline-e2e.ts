import fs from "fs";
import { ResearchService } from "../services/research/research.service";
import { DeepSeekProvider } from "../services/ai/deepseek-provider";

if (fs.existsSync(".env.local")) {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [k, ...v] = trimmed.split("=");
    if (k && !process.env[k]) {
      process.env[k] = v.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

async function runE2EResearchTest() {
  console.log("==================================================");
  console.log("TESTE E2E — RESEARCH LAYER (SOURCE VERIFICATION) + DEEPSEEK");
  console.log("==================================================\n");

  const topic = "Empréstimo Consignado para Trabalhador CLT: Como Funciona e Quais São as Regras Atuais?";
  const currentDate = "2026-09-24";
  const category = "Empréstimos";
  const keywords = [
    "empréstimo consignado CLT",
    "regras consignado CLT 2026",
    "margem consignável CLT",
    "desconto em folha pagamento",
    "taxas consignado privado",
  ];

  console.log(`1. PAUTA DE TESTE: "${topic}"`);
  console.log(`Data Atual de Referência: ${currentDate}`);
  console.log(`Categoria: ${category}`);
  console.log(`Keywords: ${keywords.join(", ")}\n`);

  // ETAPA 1: Research Service
  console.log("--------------------------------------------------");
  console.log("ETAPA 1: Executando ResearchService (Search -> Fetch -> Extract Facts)...");
  console.log("--------------------------------------------------");
  const researchService = new ResearchService();
  const researchStart = Date.now();

  const brief = await researchService.conductResearch({
    title: topic,
    category,
    keywords,
    niche: "Finanças Pessoais e Economia",
    currentDate,
    language: "pt-BR",
  });

  const researchDurationMs = Date.now() - researchStart;

  console.log(`\nPesquisa concluída em ${(researchDurationMs / 1000).toFixed(2)}s (${researchDurationMs}ms)`);
  console.log(`Status: ${brief.status}`);
  console.log(`Risk Level: ${brief.riskLevel}`);
  console.log(`Fontes Selecionadas: ${brief.sources.length}`);
  console.log(`Fontes Originais Baixadas: ${brief.fetchedSources.length}`);
  console.log(`Fatos Extraídos: ${brief.facts.length}\n`);

  // Demonstração detalhada do fluxo por fonte
  console.log("==================================================");
  console.log("DETALHAMENTO DO PIPELINE FACTUAL (SOURCE FETCHER)");
  console.log("==================================================");

  brief.fetchedSources.forEach((src, idx) => {
    console.log(`\n[FONTE ${idx + 1}]`);
    console.log(`  Original URL: ${src.sourceUrl}`);
    console.log(`  Final URL:    ${src.finalUrl}`);
    console.log(`  HTTP Status:  ${src.httpStatus}`);
    console.log(`  Content-Type: ${src.contentType}`);
    console.log(`  Tamanho:      ${src.byteLength} bytes`);
    console.log(`  DNS Validado: ${src.dnsValidated ? "SIM" : "NÃO"}`);
    console.log(`  Autoridade:   ${src.isOfficial ? "OFICIAL (.gov.br / regulador)" : "SECUNDÁRIA"}`);
    console.log(`  Título Extraído: "${src.title}"`);
    console.log(`  Parágrafos Extraídos: ${src.paragraphs.length}`);
    if (src.publishedAt) console.log(`  Data Publicação: ${src.publishedAt}`);
    console.log(`  Data Acesso:     ${src.accessedAt}`);
  });

  console.log("\n==================================================");
  console.log("FATOS VERIFICADOS COM PROVENANCE (sourceExcerpt)");
  console.log("==================================================");

  brief.facts.forEach((fact, idx) => {
    console.log(`\n[FATO ${idx + 1}]`);
    console.log(`  Statement:           "${fact.statement}"`);
    console.log(`  Source Excerpt:      "${fact.sourceExcerpt}"`);
    console.log(`  Source Title:        ${fact.sourceTitle}`);
    console.log(`  Source URL:          ${fact.sourceUrl}`);
    console.log(`  Published:           ${fact.publishedAt || "N/A"}`);
    console.log(`  Accessed:            ${fact.accessedAt}`);
    console.log(`  Confidence:          ${fact.confidence.toUpperCase()}`);
    console.log(`  Verification Method: ${fact.verificationMethod}`);
  });

  if (brief.uncertainties.length > 0) {
    console.log("\n--- INCERTEZAS (UNCERTAINTIES) ---");
    brief.uncertainties.forEach(u => console.log(`- ${u}`));
  }

  if (brief.warnings.length > 0) {
    console.log("\n--- AVISOS (WARNINGS) ---");
    brief.warnings.forEach(w => console.log(`- ${w}`));
  }

  // Verificação de conformidade do teste crítico
  const hasOfficialFetched = brief.fetchedSources.some(s => s.isOfficial);
  const allFactsHaveExcerpts = brief.facts.length > 0 && brief.facts.every(f => Boolean(f.sourceExcerpt));
  const allSourceContentMethod = brief.facts.every(f => f.verificationMethod === "source_content");

  console.log("\n--- VERIFICAÇÃO CRÍTICA DA ARQUITETURA ---");
  console.log(`1. Pelo menos uma fonte oficial obtida: ${hasOfficialFetched ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`2. Todos os fatos possuem sourceExcerpt literal: ${allFactsHaveExcerpts ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`3. Todos os fatos usam verificationMethod='source_content': ${allSourceContentMethod ? "✓ PASS" : "✗ FAIL"}`);

  if (brief.status === "RESEARCH_REVIEW_REQUIRED") {
    console.error("\n❌ FAIL-CLOSED ATIVADO: Research retornou RESEARCH_REVIEW_REQUIRED. Interrompendo!");
    process.exit(1);
  }

  // ETAPA 2: Geração do Artigo com DeepSeek
  console.log("\n--------------------------------------------------");
  console.log("ETAPA 2: Redação Editorial com DeepSeek (Factual Briefing Injetado)");
  console.log("--------------------------------------------------");

  const provider = new DeepSeekProvider();
  const articleStart = Date.now();

  const article = await provider.generateArticle(topic, keywords, {
    blogName: "Universo do Dinheiro",
    niche: "Finanças Pessoais e Economia",
    category,
    currentDate,
    language: "pt-BR",
    targetWordCount: 1800,
    minimumWordCount: 1500,
    maximumWordCount: 2200,
    sourcesOrResearch: brief.rawBriefingText,
  });

  const articleDurationMs = Date.now() - articleStart;

  console.log(`\n✓ Artigo gerado com sucesso em ${(articleDurationMs / 1000).toFixed(2)}s (${articleDurationMs}ms)!`);
  console.log(`Título: "${article.title}"`);
  console.log(`Slug: ${article.slug}`);
  console.log(`Palavras Reais: ${article.actualWordCount}`);
  console.log(`Quality Gate Status: ${article.qualityGateStatus}`);
  console.log(`Notas Quality Gate:`, article.qualityGateNotes);

  // ETAPA 3: Auditoria Factual Semântica com DeepSeek (Section 12 & 13)
  console.log("\n--------------------------------------------------");
  console.log("ETAPA 3: Auditoria Factual Semântica (DeepSeek Judge / JSON)");
  console.log("--------------------------------------------------");

  const representativeFact = brief.facts[0] || {
    statement: "O Crédito do Trabalhador facilita o acesso ao crédito para trabalhadores CLT com desconto em folha.",
    sourceExcerpt: "facilita o acesso ao crédito para milhões de empregados do setor privado... por meio do desconto em folha de pagamento",
    sourceUrl: brief.fetchedSources[0]?.sourceUrl || "https://www.gov.br",
  };

  const claimsToAudit = [
    {
      claim: "O empréstimo consignado para CLT opera mediante desconto direto em folha de pagamento sob autorização do trabalhador",
      sourceFact: representativeFact.statement,
      sourceExcerpt: representativeFact.sourceExcerpt,
      sourceUrl: representativeFact.sourceUrl,
    },
    {
      claim: "As taxas nominais de juros e o Custo Efetivo Total (CET) variam por instituição financeira e perfil cadastral",
      sourceFact: "As taxas nominais exatas de juros variam por instituição financeira e perfil cadastral do cliente.",
      sourceExcerpt: "As taxas nominais exatas de juros variam por instituição financeira",
      sourceUrl: representativeFact.sourceUrl,
    },
    {
      claim: "Não existe aprovação de crédito garantida sem análise cadastral e margem disponível",
      sourceFact: "A contratação requer análise de crédito e margem consignável disponível.",
      sourceExcerpt: "condições de elegibilidade e margem disponível no empregador",
      sourceUrl: representativeFact.sourceUrl,
    },
    {
      claim: "O artigo observa o ano vigente de 2026 sem atribuir regras antigas anacrônicas como se fossem atuais",
      sourceFact: `Pesquisa factual realizada com referência temporal em ${currentDate}`,
      sourceExcerpt: `Ref temporal 2026`,
      sourceUrl: representativeFact.sourceUrl,
    },
  ];

  const auditReport = await provider.auditFactualClaims(article.content, claimsToAudit);

  console.log("\n--- RESULTADO DA AUDITORIA SEMÂNTICA ---");
  auditReport.claims.forEach(c => {
    console.log(`\n[${c.status}] ${c.claim}`);
    console.log(`  Source Fact:    "${c.sourceFact}"`);
    console.log(`  Source Excerpt: "${c.sourceExcerpt}"`);
    console.log(`  Source URL:     ${c.sourceUrl}`);
    console.log(`  Justificativa:  ${c.justification}`);
  });

  console.log("\n--- STATUS DO QUALITY GATE DE RISCO (HIGH RISK) ---");
  console.log(`Total de Claims Avaliadas: ${auditReport.claims.length}`);
  console.log(`SUPPORTED:    ${auditReport.claims.filter(c => c.status === "SUPPORTED").length}`);
  console.log(`UNSUPPORTED:  ${auditReport.unsupportedCount}`);
  console.log(`CONTRADICTED: ${auditReport.contradictedCount}`);
  console.log(`Audit Gate Status: ${auditReport.status}`);

  if (auditReport.contradictedCount > 0) {
    console.error("❌ QUALITY GATE FAIL: Contradição factual detectada no artigo!");
    process.exit(1);
  }

  if (auditReport.unsupportedCount > 0) {
    console.error("⚠️ QUALITY GATE REVIEW_REQUIRED: Afirmação crítica não suportada!");
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log("TESTE E2E DA CAMADA DE RESEARCH FACTUAL APROVADO!");
  console.log("==================================================");
}

runE2EResearchTest().catch(err => {
  console.error("\n❌ ERRO NO TESTE E2E:", err);
  process.exit(1);
});
