import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const envMap: Record<string, string> = {};
for (const line of env.split('\n')) {
  const [k, ...v] = line.trim().split('=');
  if (k) envMap[k] = v.join('=').replace(/^["']|["']$/g, '');
}

const supabaseAdmin = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const BASE_URL = 'http://127.0.0.1:3000';
const BLOG_ID = 'c650f998-3812-4644-9465-d67145915830'; // Universo do Dinheiro
const CATEGORY = 'Empréstimos';

interface IdeaItem {
  title: string;
  keywords: string;
  description: string;
  type: string;
}

interface RequestMetric {
  step: number;
  durationMs: number;
  durationSec: number;
  status: number;
  title: string;
  keywords: string;
  type: string;
}

async function runSequentialQueueE2E() {
  console.log('====================================================');
  console.log('TESTE E2E — FILA SEQUENCIAL DO GERADOR DE PAUTAS');
  console.log('Alvo: http://127.0.0.1:3000');
  console.log('Blog: Universo do Dinheiro (' + BLOG_ID + ')');
  console.log('Categoria: ' + CATEGORY);
  console.log('Quantidade solicitada: 5 ideias');
  console.log('====================================================\n');

  // 1. Autenticar usuário
  console.log('1. Autenticando usuário via Supabase Auth...');
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'kynoviabr@gmail.com',
  });
  if (linkErr || !linkData) throw new Error('Falha ao gerar magic link: ' + linkErr?.message);

  const { data: verifyData, error: verifyErr } = await supabaseAnon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyErr || !verifyData.session) throw new Error('Falha ao verificar OTP: ' + verifyErr?.message);

  const session = verifyData.session;
  const cookieJar: Record<string, string> = {};
  const serverClient = createServerClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return Object.entries(cookieJar).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          cookieJar[name] = value;
        });
      },
    },
  });

  await serverClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  const cookieHeader = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');

  // 2. Verificar estado inicial do editorial_calendar
  const { count: initialCalendarCount } = await supabaseAdmin
    .from('editorial_calendar')
    .select('*', { count: 'exact', head: true })
    .eq('blog_id', BLOG_ID);

  console.log(`2. Total inicial de pautas no editorial_calendar para o blog: ${initialCalendarCount}\n`);

  // 3. Execução da fila sequencial de 5 pautas
  console.log('3. Iniciando fila sequencial de 5 pautas...');
  const generatedIdeas: IdeaItem[] = [];
  const metrics: RequestMetric[] = [];

  for (let i = 1; i <= 5; i++) {
    console.log(`\n--- [Pauta ${i}/5] Enviando requisição ---`);
    console.log(`Existing ideas enviadas na requisição: ${generatedIdeas.length}`);

    const existingIdeasPayload = generatedIdeas.map((idea) => ({
      title: idea.title,
      keywords: idea.keywords,
      type: idea.type,
    }));

    const reqStart = Date.now();
    const res = await fetch(`${BASE_URL}/api/content/ideas/generate-one`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        blogId: BLOG_ID,
        category: CATEGORY,
        existingIdeas: existingIdeasPayload,
        queuePosition: i,
        totalRequested: 5,
      }),
    });

    const durationMs = Date.now() - reqStart;
    const durationSec = Number((durationMs / 1000).toFixed(2));

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Erro na requisição ${i}: HTTP ${res.status} - ${errText}`);
      throw new Error(`Falha no item ${i}: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data.success || !data.idea) {
      throw new Error(`Resposta inválida no item ${i}: ` + JSON.stringify(data));
    }

    const idea: IdeaItem = data.idea;
    generatedIdeas.push(idea);

    const metric: RequestMetric = {
      step: i,
      durationMs,
      durationSec,
      status: res.status,
      title: idea.title,
      keywords: idea.keywords,
      type: idea.type,
    };
    metrics.push(metric);

    console.log(`[OK] Pauta ${i}/5 gerada em ${durationSec}s (HTTP ${res.status}):`);
    console.log(`     Título: "${idea.title}"`);
    console.log(`     Palavras-chave: ${idea.keywords}`);
    console.log(`     Tipo: ${idea.type}`);

    // Intervalo de segurança de 1.5s entre chamadas sequenciais
    if (i < 5) {
      console.log('Aguardando 1.5s antes da próxima requisição...');
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // 4. Verificação de não-inserção automática no banco
  console.log('\n4. Verificando persistência no banco de dados...');
  const { count: afterQueueCount } = await supabaseAdmin
    .from('editorial_calendar')
    .select('*', { count: 'exact', head: true })
    .eq('blog_id', BLOG_ID);

  console.log(`Total de pautas no editorial_calendar após a fila: ${afterQueueCount}`);
  const autoSaved = (afterQueueCount || 0) - (initialCalendarCount || 0);
  console.log(`Pautas salvas automaticamente: ${autoSaved}`);
  if (autoSaved !== 0) {
    throw new Error('VIOLAÇÃO: Pautas foram inseridas automaticamente sem aprovação do usuário!');
  }
  console.log('[CONFIRMADO] Nenhuma pauta foi salva automaticamente no editorial_calendar.');

  // 5. Teste de seleção manual e inserção via batch (ex: 2 de 5)
  console.log('\n5. Testando seleção manual de 2 pautas e envio para /api/content/ideas/batch...');
  const selectedIdeas = [generatedIdeas[0], generatedIdeas[2]]; // Pauta 1 e Pauta 3
  console.log(`Selecionadas para o calendário:`);
  console.log(`- 1: "${selectedIdeas[0].title}"`);
  console.log(`- 2: "${selectedIdeas[1].title}"`);

  const batchRes = await fetch(`${BASE_URL}/api/content/ideas/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      blogId: BLOG_ID,
      category: CATEGORY,
      ideas: selectedIdeas,
    }),
  });

  if (!batchRes.ok) {
    throw new Error(`Falha no batch insert: HTTP ${batchRes.status}`);
  }

  const batchData = await batchRes.json();
  console.log(`Batch response: success=${batchData.success}, count=${batchData.count}`);

  const { count: finalCalendarCount, data: insertedRecords } = await supabaseAdmin
    .from('editorial_calendar')
    .select('id, proposed_title, status, created_at')
    .eq('blog_id', BLOG_ID)
    .order('created_at', { ascending: false })
    .limit(2);

  console.log(`Total final no editorial_calendar: ${finalCalendarCount} (aumento de +${(finalCalendarCount || 0) - (initialCalendarCount || 0)})`);
  console.log(`Últimos registros inseridos no banco:`, insertedRecords);

  // 6. Teste de proteção contra non-JSON / 504 / HTML
  console.log('\n6. Testando resiliência e proteção contra erros...');
  const invalidRes = await fetch(`${BASE_URL}/api/content/ideas/generate-one`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      blogId: '00000000-0000-0000-0000-000000000000',
      queuePosition: 1,
      totalRequested: 1,
    }),
  });

  const invalidJson = await invalidRes.json();
  console.log(`Status para blog inválido: HTTP ${invalidRes.status}`);
  console.log(`Formato da resposta de erro (JSON garantido):`, invalidJson);
  if (typeof invalidJson !== 'object' || invalidJson.success !== false) {
    throw new Error('Endpoint não retornou JSON estruturado de erro!');
  }
  console.log('[CONFIRMADO] Erros retornam JSON válido { success: false, error }, protegendo frontend de Unexpected token');

  // Limpeza dos 2 registros de teste inseridos para manter o banco limpo
  if (insertedRecords && insertedRecords.length > 0) {
    const idsToDelete = insertedRecords.map((r) => r.id);
    await supabaseAdmin.from('editorial_calendar').delete().in('id', idsToDelete);
    console.log(`\n[CLEANUP] 2 pautas de teste removidas do editorial_calendar para preservar estado do banco.`);
  }

  // 7. Resumo consolidado de métricas
  console.log('\n====================================================');
  console.log('MÉTRICAS CONSOLIDADAS DO TESTE E2E:');
  console.log('====================================================');
  metrics.forEach((m) => {
    console.log(`Pauta ${m.step}: ${m.durationSec}s | HTTP ${m.status} | "${m.title}"`);
  });

  const maxDuration = Math.max(...metrics.map((m) => m.durationSec));
  const avgDuration = (metrics.reduce((acc, m) => acc + m.durationSec, 0) / metrics.length).toFixed(2);
  console.log(`\nMAX Duração Individual: ${maxDuration}s (Limite orçamentário: < 45s)`);
  console.log(`MÉDIA Duração: ${avgDuration}s`);
  console.log(`Todas abaixo de 45s: ${maxDuration < 45 ? 'SIM (APROVADO)' : 'NÃO (REPROVADO)'}`);
  console.log('====================================================\n');
}

runSequentialQueueE2E().catch((err) => {
  console.error('ERRO FATAL NO TESTE E2E:', err);
  process.exit(1);
});
