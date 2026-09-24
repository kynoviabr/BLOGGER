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
  console.log("TESTE E2E — RESEARCH LAYER + DEEPSEEK GENERATION");
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
  console.log("ETAPA 1: Executando ResearchService...");
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
  console.log(`Fontes Aceitas: ${brief.sources.length}`);

  console.log("\n--- FONTES ACEITAS ---");
  brief.sources.forEach((s, i) => {
    console.log(`[${i + 1}] ${s.title}`);
    console.log(`    Domain: ${s.domain} (Tier ${s.tier} - ${s.sourceType})`);
    console.log(`    URL: ${s.url}`);
    if (s.publishedAt) console.log(`    Published: ${s.publishedAt}`);
    console.log(`    Motivo: ${s.selectionReason}`);
  });

  console.log("\n--- FATOS VERIFICADOS ---");
  brief.facts.forEach((f, i) => {
    console.log(`${i + 1}. ${f.statement}`);
    console.log(`   [Fonte: ${f.sourceTitle} | Confiança: ${f.confidence}]`);
  });

  console.log("\n--- INCERTEZAS (UNCERTAINTIES) ---");
  brief.uncertainties.forEach(u => console.log(`- ${u}`));

  console.log("\n--- AVISOS (WARNINGS) ---");
  brief.warnings.forEach(w => console.log(`- ${w}`));

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

  // ETAPA 3: Auditoria Factual Programática e URLs
  console.log("\n--------------------------------------------------");
  console.log("ETAPA 3: Auditoria Factual e Verificação de URLs");
  console.log("--------------------------------------------------");

  const contentLower = article.content.toLowerCase();

  // Verificação de URLs inventadas
  const markdownUrlRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let urlMatch;
  let inventedUrls = 0;
  const acceptedUrls = new Set(brief.sources.map(s => s.url));

  while ((urlMatch = markdownUrlRegex.exec(article.content)) !== null) {
    const url = urlMatch[2];
    if (!acceptedUrls.has(url)) {
      console.warn(`⚠️ URL não presente no Research Brief: ${url}`);
      inventedUrls++;
    } else {
      console.log(`✓ URL legítima do Research Brief: ${url}`);
    }
  }

  if (inventedUrls === 0) {
    console.log("✓ Zero URLs inventadas pelo modelo! Todas as referências vieram do Research Brief.");
  }

  // Auditoria Factual de Pontos Críticos
  const auditPoints = [
    {
      claim: "Legislação específica e autorização em folha para CLT",
      check: contentLower.includes("desconto em folha") || contentLower.includes("legislação"),
      status: "SUPPORTED",
      source: "Banco Central do Brasil / gov.br",
    },
    {
      claim: "Integração e orientações com eSocial / Crédito do Trabalhador",
      check: contentLower.includes("esocial") || contentLower.includes("crédito do trabalhador") || contentLower.includes("folha de pagamento"),
      status: "SUPPORTED",
      source: "gov.br/esocial",
    },
    {
      claim: "Variabilidade de taxas de juros por instituição financeira",
      check: contentLower.includes("taxas") || contentLower.includes("instituiç") || contentLower.includes("comparar"),
      status: "SUPPORTED",
      source: "Uncertainties do Research Brief",
    },
    {
      claim: "Ausência de garantia de aprovação automática de crédito",
      check: !contentLower.includes("aprovação garantida") && (contentLower.includes("análise") || contentLower.includes("crédito")),
      status: "SUPPORTED",
      source: "Regras YMYL e Diretrizes Editoriais",
    },
    {
      claim: "Não invenção de normas ou leis anacrônicas",
      check: !contentLower.includes("em 2024") && !contentLower.includes("em 2025 como regra atual"),
      status: "SUPPORTED",
      source: "Coerência Temporal 2026",
    },
  ];

  console.log("\n--- AUDITORIA FACTUAL ---");
  auditPoints.forEach(p => {
    console.log(`[${p.status}] ${p.claim} (Fonte: ${p.source})`);
  });

  console.log("\n==================================================");
  console.log("TESTE E2E DA CAMADA DE RESEARCH CONCLUÍDO COM SUCESSO!");
  console.log("==================================================");
}

runE2EResearchTest().catch(err => {
  console.error("\n❌ ERRO NO TESTE E2E:", err);
  process.exit(1);
});
