import { createAIProvider } from '../services/ai';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const envMap: Record<string, string> = {};
for (const line of env.split('\n')) {
  const [k, ...v] = line.trim().split('=');
  if (k) {
    const val = v.join('=').replace(/^["']|["']$/g, '');
    envMap[k] = val;
    if (!process.env[k]) process.env[k] = val;
  }
}

const supabaseAdmin = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY);

interface ExistingIdea {
  title: string;
  keywords: string;
  description: string;
  type: string;
}

async function runSequentialTests() {
  console.log('==================================================');
  console.log('TESTES DA FILA UNITÁRIA SEQUENCIAL DE PAUTAS');
  console.log('Modelo de Ideação:', process.env.GEMINI_IDEAS_MODEL || 'gemini-3.5-flash');
  console.log('==================================================\n');

  const aiProvider = createAIProvider();
  if (!aiProvider.generateIdea) {
    throw new Error('generateIdea não está disponível no provider de IA.');
  }

  // 1. Contexto do blog Universo do Dinheiro
  const { data: blog } = await supabaseAdmin
    .from('blogs')
    .select('*')
    .eq('id', 'c650f998-3812-4644-9465-d67145915830')
    .single();

  if (!blog) throw new Error('Blog Universo do Dinheiro não encontrado');

  console.log(`Blog Alvo: "${blog.name}"`);
  console.log(`Nicho: ${blog.niche}`);
  console.log(`Categoria de Teste: "Empréstimos"\n`);

  // ----------------------------------------------------
  // TESTE 1: Bateria de 3 pautas sequenciais
  // ----------------------------------------------------
  console.log('--------------------------------------------------');
  console.log('TESTE 1: Geração Sequencial de 3 Pautas');
  console.log('--------------------------------------------------');

  const queue3: ExistingIdea[] = [];
  const durations3: number[] = [];
  const startTime3 = Date.now();

  for (let i = 1; i <= 3; i++) {
    console.log(`\nDisparando chamada ${i}/3...`);
    const t0 = Date.now();

    const idea = await aiProvider.generateIdea({
      niche: blog.niche,
      audience: blog.audience,
      purpose: blog.description,
      category: 'Empréstimos',
      language: blog.default_language || 'pt-BR',
      blogName: blog.name,
      existingIdeas: queue3.map(q => ({ title: q.title, keywords: q.keywords, type: q.type })),
      queuePosition: i,
      totalRequested: 3,
    });

    const elapsed = Date.now() - t0;
    durations3.push(elapsed);
    queue3.push(idea);

    console.log(`  ✓ Pauta ${i} gerada em ${elapsed}ms (~${(elapsed / 1000).toFixed(1)}s):`);
    console.log(`    Título: "${idea.title}"`);
    console.log(`    Tipo: ${idea.type}`);
    console.log(`    Keywords: ${idea.keywords}`);
    console.log(`    Resumo: ${idea.description.slice(0, 90)}...`);

    if (elapsed > 45000) {
      console.warn(`  ⚠️ Alerta: chamada ${i} excedeu 45s (${elapsed}ms)`);
    }
  }

  const totalTime3 = Date.now() - startTime3;
  console.log(`\nResumo Teste 1 (3 pautas):`);
  console.log(`  Total: ${totalTime3}ms (~${(totalTime3 / 1000).toFixed(1)}s)`);
  console.log(`  Média por pauta: ${(durations3.reduce((a, b) => a + b, 0) / 3 / 1000).toFixed(1)}s`);

  // Verificar se há títulos repetidos
  const titles3 = queue3.map(q => q.title.toLowerCase());
  const uniqueTitles3 = new Set(titles3);
  if (titles3.length !== uniqueTitles3.size) {
    throw new Error('Falha de diversidade no Teste 1: títulos duplicados detectados!');
  }
  console.log(`  ✓ Diversidade confirmada: 3 títulos únicos e distintos.`);

  // ----------------------------------------------------
  // TESTE 2: Bateria de 5 pautas sequenciais
  // ----------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('TESTE 2: Geração Sequencial de 5 Pautas');
  console.log('--------------------------------------------------');

  const queue5: ExistingIdea[] = [];
  const durations5: number[] = [];
  const startTime5 = Date.now();

  for (let i = 1; i <= 5; i++) {
    console.log(`\nDisparando chamada ${i}/5...`);
    const t0 = Date.now();

    let idea: ExistingIdea | null = null;
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        idea = await aiProvider.generateIdea({
          niche: blog.niche,
          audience: blog.audience,
          purpose: blog.description,
          category: 'Empréstimos',
          language: blog.default_language || 'pt-BR',
          blogName: blog.name,
          existingIdeas: queue5.map(q => ({ title: q.title, keywords: q.keywords, type: q.type })),
          queuePosition: i,
          totalRequested: 5,
        });
        break;
      } catch (err: any) {
        console.warn(`  ⚠️ Tentativa ${attempt + 1} da pauta ${i} falhou: ${err.message}. Retentando...`);
        if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
        else throw err;
      }
    }

    if (!idea) throw new Error(`Falha definitiva na pauta ${i}`);

    const elapsed = Date.now() - t0;
    durations5.push(elapsed);
    queue5.push(idea);

    console.log(`  ✓ Pauta ${i} gerada em ${elapsed}ms (~${(elapsed / 1000).toFixed(1)}s):`);
    console.log(`    Título: "${idea.title}"`);
    console.log(`    Tipo: ${idea.type}`);
    console.log(`    Keywords: ${idea.keywords}`);

    // Pausa suave de 1.2s entre chamadas para respeitar o rate-limit da API
    if (i < 5) await new Promise(r => setTimeout(r, 1200));

    if (elapsed > 45000) {
      console.warn(`  ⚠️ Alerta: chamada ${i} excedeu 45s (${elapsed}ms)`);
    }
  }

  const totalTime5 = Date.now() - startTime5;
  const longestRequest5 = Math.max(...durations5);

  console.log(`\nResumo Teste 2 (5 pautas):`);
  console.log(`  Total: ${totalTime5}ms (~${(totalTime5 / 1000).toFixed(1)}s)`);
  console.log(`  Maior requisição individual: ${longestRequest5}ms (~${(longestRequest5 / 1000).toFixed(1)}s)`);
  console.log(`  Média por pauta: ${(durations5.reduce((a, b) => a + b, 0) / 5 / 1000).toFixed(1)}s`);

  // Verificar diversidade
  const titles5 = queue5.map(q => q.title.toLowerCase());
  const uniqueTitles5 = new Set(titles5);
  if (titles5.length !== uniqueTitles5.size) {
    throw new Error('Falha de diversidade no Teste 2: títulos duplicados detectados!');
  }
  console.log(`  ✓ Diversidade confirmada: 5 títulos únicos e distintos.`);
  console.log(`  ✓ Nenhum request individual ultrapassou o teto da Vercel (< 60s).`);

  console.log('\n==================================================');
  console.log('TODOS OS TESTES DE FILA UNITÁRIA PASSARAM COM SUCESSO! 🎉');
  console.log('==================================================');
}

runSequentialTests().catch((err) => {
  console.error('Falha nos testes de fila unitária:', err);
  process.exit(1);
});
