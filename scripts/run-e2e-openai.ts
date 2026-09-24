import { createClient } from '@supabase/supabase-js';
import { createChunks } from '@supabase/ssr';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const envMap: Record<string, string> = {};
for (const line of env.split('\n')) {
  const [k, ...v] = line.trim().split('=');
  if (k) envMap[k] = v.join('=').replace(/^[\"']|[\"']$/g, '');
}

const supabaseAdmin = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function runE2E() {
  console.log('==================================================');
  console.log('INICIANDO EXECUÇÃO REAL DO PIPELINE EDITORIAL E2E');
  console.log('Provedor de Imagem Alvo: OpenAIImageProvider (gpt-image-1-mini)');
  console.log('==================================================\n');

  const targetId = 'befcd0c1-e936-4b87-a4e7-bbac15bb023a';

  console.log('1. Gerando sessão de autenticação...');
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'kynoviabr@gmail.com',
  });

  if (linkErr || !linkData) {
    throw new Error(`Falha ao gerar magic link: ${linkErr?.message}`);
  }

  const { data: verifyData, error: verifyErr } = await supabaseAnon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (verifyErr || !verifyData.session) {
    throw new Error(`Falha na verificação OTP: ${verifyErr?.message}`);
  }

  const session = verifyData.session;
  const projectRef = new URL(envMap.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const cookieName = 'sb-' + projectRef + '-auth-token';
  const val = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const chunks = createChunks(cookieName, val);
  const cookieHeader = chunks.map((c: any) => c.name + '=' + c.value).join('; ');

  const prodUrl = `https://blogger-bice-three.vercel.app/api/calendar/${targetId}/execute`;
  console.log(`2. Disparando pipeline via: ${prodUrl}`);
  console.log(`Hora de início: ${new Date().toISOString()}`);

  const start = Date.now();
  const res = await fetch(prodUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
  });

  const durationMs = Date.now() - start;
  const json = await res.json().catch(() => ({}));

  console.log('\n==================================================');
  console.log('RESPOSTA DO PIPELINE E2E:');
  console.log('==================================================');
  console.log('HTTP Status:', res.status);
  console.log('Duração total:', durationMs, 'ms (~' + (durationMs / 1000).toFixed(1) + 's)');
  console.log('Response body:', JSON.stringify(json, null, 2));
}

runE2E().catch((err) => {
  console.error('Erro na execução do script E2E:', err);
  process.exit(1);
});
