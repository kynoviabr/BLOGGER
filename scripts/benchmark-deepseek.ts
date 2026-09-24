import { createClient } from '@supabase/supabase-js';
import { DeepSeekProvider } from '@/services/ai/deepseek-provider';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const envMap: Record<string, string> = {};
for (const line of env.split('\n')) {
  const [k, ...v] = line.trim().split('=');
  if (k) envMap[k] = v.join('=').replace(/^["']|["']$/g, '');
}

const supabaseAdmin = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY);
const BLOG_ID = 'c650f998-3812-4644-9465-d67145915830'; // Universo do Dinheiro
const CATEGORY = 'Empréstimos';

// Preços oficiais do DeepSeek Chat (V3) por milhão de tokens:
// Input: $0.14 / 1M tokens (cache miss), Output: $0.28 / 1M tokens
function calculateDeepSeekCost(promptTokens: number, completionTokens: number): number {
  const inputCost = (promptTokens / 1_000_000) * 0.14;
  const outputCost = (completionTokens / 1_000_000) * 0.28;
  return inputCost + outputCost;
}

async function runBenchmark() {
  console.log('====================================================');
  console.log('BENCHMARK EDITORIAL DEEPSEEK — BLOGGER');
  console.log('Blog: Universo do Dinheiro');
  console.log('Categoria: ' + CATEGORY);
  console.log('Data: ' + new Date().toISOString());
  console.log('====================================================\n');

  // 1. Obter dados do blog
  const { data: blog, error: blogErr } = await supabaseAdmin
    .from('blogs')
    .select('*')
    .eq('id', BLOG_ID)
    .single();

  if (blogErr || !blog) throw new Error('Blog não encontrado: ' + blogErr?.message);

  const provider = new DeepSeekProvider({
    apiKey: envMap.DEEPSEEK_API_KEY,
    model: envMap.DEEPSEEK_MODEL || 'deepseek-chat',
    baseUrl: envMap.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  });

  // ==========================================================
  // PARTE 1: GERAÇÃO SEQUENCIAL DE 5 PAUTAS (1 por 1)
  // ==========================================================
  console.log('--- TESTE 1: FILA SEQUENCIAL DE 5 PAUTAS ---');
  const ideas: Array<{ title: string; keywords: string; description: string; type: string }> = [];
  const ideaMetrics: Array<{
    step: number;
    title: string;
    keywords: string;
    type: string;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  }> = [];

  for (let i = 1; i <= 5; i++) {
    console.log(`\nGerando pauta ${i} de 5...`);
    const start = Date.now();

    const res = await provider.generateIdea({
      blogName: blog.name,
      niche: blog.niche || 'Finanças Pessoais',
      audience: blog.audience || 'Brasileiros buscando crédito e organização',
      purpose: blog.description || 'Autoridade e precisão técnica',
      category: CATEGORY,
      language: blog.default_language || 'pt-BR',
      existingIdeas: ideas,
      queuePosition: i,
      totalRequested: 5,
    });

    const latencyMs = Date.now() - start;
    const promptTokens = res.usage?.promptTokens || 0;
    const completionTokens = res.usage?.completionTokens || 0;
    const totalTokens = res.usage?.totalTokens || 0;
    const costUsd = calculateDeepSeekCost(promptTokens, completionTokens);

    ideas.push({
      title: res.title,
      keywords: res.keywords,
      description: res.description,
      type: res.type,
    });

    ideaMetrics.push({
      step: i,
      title: res.title,
      keywords: res.keywords,
      type: res.type,
      latencyMs,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
    });

    console.log(`[Pauta ${i}] "${res.title}"`);
    console.log(`  Tipo: ${res.type}`);
    console.log(`  Keywords: ${res.keywords}`);
    console.log(`  Latência: ${(latencyMs / 1000).toFixed(2)}s | Tokens: ${totalTokens} (${promptTokens} in / ${completionTokens} out) | Custo: $${costUsd.toFixed(6)}`);
  }

  // ==========================================================
  // PARTE 2: GERAÇÃO DE ARTIGO COMPLETO (1800 palavras)
  // ==========================================================
  const selectedIdea = ideas[0];
  console.log('\n====================================================');
  console.log('--- TESTE 2: GERAÇÃO DE ARTIGO COMPLETO COM DEEPSEEK ---');
  console.log(`Pauta Selecionada: "${selectedIdea.title}"`);
  console.log(`Keywords: ${selectedIdea.keywords}`);
  console.log('Target: 1800 palavras (faixa 1500–2200)');
  console.log('Iniciando chamada ao DeepSeek...');
  console.log('====================================================\n');

  const articleKeywords = selectedIdea.keywords.split(',').map((k) => k.trim());
  const articleStart = Date.now();

  const articleResult = await provider.generateArticle(
    selectedIdea.title,
    articleKeywords,
    {
      blogName: blog.name,
      niche: blog.niche || 'Finanças Pessoais',
      blogDescription: blog.description,
      audience: blog.audience,
      language: blog.default_language || 'pt-BR',
      category: CATEGORY,
      notes: selectedIdea.description,
      targetWordCount: 1800,
      minimumWordCount: 1500,
      maximumWordCount: 2200,
    }
  );

  const articleDurationMs = Date.now() - articleStart;
  const articlePromptTokens = articleResult.usage?.promptTokens || 0;
  const articleCompletionTokens = articleResult.usage?.completionTokens || 0;
  const articleTotalTokens = articleResult.usage?.totalTokens || 0;
  const articleCostUsd = calculateDeepSeekCost(articlePromptTokens, articleCompletionTokens);

  console.log('Artigo gerado com sucesso!');
  console.log(`Tempo de geração: ${(articleDurationMs / 1000).toFixed(2)}s`);
  console.log(`Word Count Real: ${articleResult.actualWordCount} palavras`);
  console.log(`Quality Gate: ${articleResult.qualityGateStatus}`);
  console.log(`Tokens: ${articleTotalTokens} (${articlePromptTokens} in / ${articleCompletionTokens} out)`);
  console.log(`Custo Estimado: $${articleCostUsd.toFixed(6)}`);

  // Salvar resultado do artigo completo para auditoria e revisão
  const benchmarkDump = {
    ideasTest: ideaMetrics,
    articleTest: {
      topic: selectedIdea.title,
      keywords: selectedIdea.keywords,
      durationMs: articleDurationMs,
      durationSec: Number((articleDurationMs / 1000).toFixed(2)),
      actualWordCount: articleResult.actualWordCount,
      targetWordCount: articleResult.targetWordCount,
      qualityGateStatus: articleResult.qualityGateStatus,
      qualityGateNotes: articleResult.qualityGateNotes,
      tokens: {
        prompt: articlePromptTokens,
        completion: articleCompletionTokens,
        total: articleTotalTokens,
      },
      costUsd: articleCostUsd,
      article: articleResult,
    },
  };

  fs.writeFileSync('/tmp/deepseek-benchmark-result.json', JSON.stringify(benchmarkDump, null, 2));
  console.log('\nArquivo de dump salvo em /tmp/deepseek-benchmark-result.json');
}

runBenchmark().catch((err) => {
  console.error('ERRO FATAL NO BENCHMARK:', err);
  process.exit(1);
});
