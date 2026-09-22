import assert from 'node:assert';
import fs from 'node:fs';

console.log('================================================================');
console.log('CONTENT FACTORY — PROMPT 01.1 VERIFICAÇÃO AUTOMATIZADA');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

// 1. Verificação de Service Role Isolation
runTest('Service Role isolado em lib/supabase/admin.ts sem fallback para anon key', () => {
  const content = fs.readFileSync('lib/supabase/admin.ts', 'utf-8');
  assert(content.includes("import 'server-only'"), "admin.ts deve conter import 'server-only'");
  assert(!content.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"), "admin.ts NÃO deve possuir fallback para anon key");
  assert(content.includes("throw new Error"), "admin.ts deve lançar erro explícito se service role key faltar");
});

// 2. Verificação de Eliminação de Mocks dos Services
runTest('Remoção de mockBlogs e fallbacks em services/blog.service.ts', () => {
  const content = fs.readFileSync('services/blog.service.ts', 'utf-8');
  assert(!content.includes('mockBlogs'), "blog.service.ts não deve conter mockBlogs");
  assert(!content.includes('catch {'), "blog.service.ts não deve engolir erros com catch vazio");
});

runTest('Remoção de mockCalendar e fallbacks em services/calendar.service.ts', () => {
  const content = fs.readFileSync('services/calendar.service.ts', 'utf-8');
  assert(!content.includes('mockCalendar'), "calendar.service.ts não deve conter mockCalendar");
});

runTest('Remoção de mockContent e fallbacks em services/content.service.ts', () => {
  const content = fs.readFileSync('services/content.service.ts', 'utf-8');
  assert(!content.includes('mockContent'), "content.service.ts não deve conter mockContent");
});

runTest('Remoção de mockMedia e fallbacks em services/media.service.ts', () => {
  const content = fs.readFileSync('services/media.service.ts', 'utf-8');
  assert(!content.includes('mockMedia'), "media.service.ts não deve conter mockMedia");
});

runTest('Remoção de mockLogs e fallbacks em services/log.service.ts', () => {
  const content = fs.readFileSync('services/log.service.ts', 'utf-8');
  assert(!content.includes('mockLogs'), "log.service.ts não deve conter mockLogs");
});

// 3. Verificação de RLS e Revogação do Role 'anon'
runTest('Migração 00001_initial_schema.sql e 00002 com revogação do role anon e RLS estrito', () => {
  const m1 = fs.readFileSync('supabase/migrations/00001_initial_schema.sql', 'utf-8');
  const m2 = fs.readFileSync('supabase/migrations/00002_harden_rls_and_grants.sql', 'utf-8');

  assert(m1.includes('REVOKE ALL ON blogs FROM anon;'), '00001 deve revogar anon de blogs');
  assert(m1.includes('TO authenticated'), '00001 deve restringir policies para authenticated');
  assert(m1.includes('TO service_role'), '00001 deve restringir policies para service_role');
  assert(!m1.includes('FOR ALL USING (true);'), '00001 não deve ter policy FOR ALL USING (true) sem role');

  assert(m2.includes('REVOKE ALL ON blogs FROM anon;'), '00002 deve revogar anon');
  assert(m2.includes('TO authenticated'), '00002 deve ter policies authenticated');
});

// 4. Verificação de Proteção em Server Actions
runTest('Server Actions em app/actions/ exigem requireAuth() antes de qualquer lógica', () => {
  const blogAction = fs.readFileSync('app/actions/blog.ts', 'utf-8');
  const calAction = fs.readFileSync('app/actions/calendar.ts', 'utf-8');
  const cntAction = fs.readFileSync('app/actions/content.ts', 'utf-8');

  assert(blogAction.includes('await requireAuth()'), 'blog.ts deve invocar requireAuth()');
  assert(calAction.includes('await requireAuth()'), 'calendar.ts deve invocar requireAuth()');
  assert(cntAction.includes('await requireAuth()'), 'content.ts deve invocar requireAuth()');
});

// 5. Verificação de Schemas Zod
runTest('Presença de esquemas Zod para validação', () => {
  assert(fs.existsSync('lib/validations/auth.schema.ts'), 'auth.schema.ts existe');
  assert(fs.existsSync('lib/validations/blog.schema.ts'), 'blog.schema.ts existe');
  assert(fs.existsSync('lib/validations/calendar.schema.ts'), 'calendar.schema.ts existe');
  assert(fs.existsSync('lib/validations/content.schema.ts'), 'content.schema.ts existe');
});

// 6. Verificação de Middleware
runTest('Middleware configurado com proteção de rotas e redirecionamento para /login', () => {
  const middleware = fs.readFileSync('middleware.ts', 'utf-8');
  assert(middleware.includes('/login'), 'middleware deve gerenciar rota /login');
  assert(middleware.includes('auth.getUser()'), 'middleware deve usar auth.getUser()');
});

// 7. Verificação de Remoção de Falsos Indicadores de Saúde
runTest('Remoção de afirmações de 100% operacionais', () => {
  const page = fs.readFileSync('app/page.tsx', 'utf-8');
  assert(!page.includes('100% operacionais'), 'app/page.tsx não deve conter texto 100% operacionais');
});

console.log(`\n================================================================`);
console.log(`RESULTADO FINAL DOS TESTES: ${passedTests}/${totalTests} PASSARAM`);
console.log(`================================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
