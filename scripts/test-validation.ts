import { validateEditorialScope } from '../services/editorial/scope-guard';
import { OFFICIAL_CATEGORIES } from '../lib/constants/categories';
import {
  sanitizeMarkdown,
  formatArticleForWordPress,
} from '../services/editorial/content-formatter';

async function runTests() {
  console.log('--- INICIANDO TESTES DO MOTOR EDITORIAL E PUBLICADOR ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // TESTE 1: As 5 Categorias Oficiais
  assert(OFFICIAL_CATEGORIES.length === 5, 'Exatamente 5 categorias oficiais definidas');
  const expectedSlugs = ['emprestimos', 'saindo-das-dividas', 'cartoes', 'investimentos', 'milhas-e-pontos'];
  const hasAllSlugs = expectedSlugs.every((s) => OFFICIAL_CATEGORIES.some((c) => c.slug === s));
  assert(hasAllSlugs, 'Todas as 5 slugs oficiais estão cadastradas corretamente');
  assert(!OFFICIAL_CATEGORIES.some((c) => (c.slug as string) === 'renda-e-milhas'), 'Nenhuma categoria antiga "renda-e-milhas" presente');

  // TESTE 2: ScopeGuard - Bloqueio de temas fora de Finanças
  const techPauta = validateEditorialScope('Como criar microsserviços escaláveis com Next.js e TypeScript', ['react', 'nextjs']);
  assert(!techPauta.isAllowed, 'ScopeGuard bloqueia temas de tecnologia/Next.js/programação');

  const iaPauta = validateEditorialScope('Agentes de IA e automação com inteligência artificial para empresas', ['ia', 'chatgpt']);
  assert(!iaPauta.isAllowed, 'ScopeGuard bloqueia temas de inteligência artificial/agentes');

  const cryptoPauta = validateEditorialScope('Melhores jogos de aposta e cassino do tigrinho', ['tigrinho', 'cassino']);
  assert(!cryptoPauta.isAllowed, 'ScopeGuard bloqueia apostas e tigrinho');

  // TESTE 3: ScopeGuard - Classificação correta nas 5 categorias
  const emprestimoPauta = validateEditorialScope('Empréstimo consignado CLT: Como solicitar e quais as taxas do INSS', ['emprestimo', 'consignado']);
  assert(emprestimoPauta.isAllowed && emprestimoPauta.matchedCategorySlug === 'emprestimos', 'Classifica corretamente em "emprestimos"');

  const dividasPauta = validateEditorialScope('Como renegociar dívidas no Feirão Serasa Limpa Nome', ['dividas', 'score', 'serasa']);
  assert(dividasPauta.isAllowed && dividasPauta.matchedCategorySlug === 'saindo-das-dividas', 'Classifica corretamente em "saindo-das-dividas"');

  const cartoesPauta = validateEditorialScope('Melhores cartões de crédito sem anuidade com limite alto em 2026', ['cartao', 'anuidade']);
  assert(cartoesPauta.isAllowed && cartoesPauta.matchedCategorySlug === 'cartoes', 'Classifica corretamente em "cartoes"');

  const investimentosPauta = validateEditorialScope('Tesouro Selic vs CDB de liquidez diária: onde guardar a reserva', ['tesouro direto', 'cdb', 'selic']);
  assert(investimentosPauta.isAllowed && investimentosPauta.matchedCategorySlug === 'investimentos', 'Classifica corretamente em "investimentos"');

  const milhasPauta = validateEditorialScope('Como acumular milhas no programa Livelo e transferir para a Smiles', ['milhas', 'livelo', 'smiles']);
  assert(milhasPauta.isAllowed && milhasPauta.matchedCategorySlug === 'milhas-e-pontos', 'Classifica corretamente em "milhas-e-pontos"');

  // TESTE 4: Sanitização de Markdown
  const rawWithEscapes = '# Título do Post\\n\\nPrimeiro parágrafo do artigo com quebra literal.\\n\\n## Subtítulo\\nTexto.';
  const sanitized = sanitizeMarkdown(rawWithEscapes, 'Título do Post');
  assert(!sanitized.includes('\\n'), 'Quebras literais \\n foram convertidas');
  assert(!sanitized.startsWith('# Título do Post'), 'H1 duplicado foi removido do corpo');

  // TESTE 5: Conversão Markdown para HTML com Tabelas e Aviso Legal
  const mdWithTable = `Este é o primeiro parágrafo sobre orçamento familiar.

| Despesa | Categoria | Percentual |
| --- | --- | --- |
| Moradia | Essencial | 35% |
| Alimentação | Essencial | 15% |

### Dicas Finais
Organize suas contas mensais.`;

  const formatted = await formatArticleForWordPress(mdWithTable, {
    title: 'Guia do Orçamento Familiar',
    categorySlug: 'saindo-das-dividas',
  });

  assert(formatted.html.includes('<table>'), 'Tabela Markdown convertida para tag HTML <table>');
  assert(formatted.html.includes('class="ud-aviso"'), 'Contém parágrafo de aviso legal com class "ud-aviso"');
  assert(formatted.excerpt.length >= 50 && formatted.excerpt.length <= 160, `Excerpt gerado dentro do limite SEO (${formatted.excerpt.length} caracteres)`);

  console.log(`\nRESUMO: ${passed} testes passaram, ${failed} falharam.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
