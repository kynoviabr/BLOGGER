import { validateEditorialScope } from '../services/editorial/scope-guard';
import { sanitizeMarkdown, formatArticleForWordPress } from '../services/editorial/content-formatter';

interface WPPost {
  id: number;
  title: { rendered: string };
  slug: string;
  status: string;
  categories: number[];
  content: { rendered: string };
  excerpt: { rendered: string };
}

const CATEGORY_MAP: Record<string, number> = {
  'cartoes': 2,
  'emprestimos': 3,
  'saindo-das-dividas': 4,
  'milhas-e-pontos': 5,
  'investimentos': 8,
};

const CATEGORY_ID_TO_SLUG: Record<number, string> = {
  2: 'cartoes',
  3: 'emprestimos',
  4: 'saindo-das-dividas',
  5: 'milhas-e-pontos',
  8: 'investimentos',
};

async function main() {
  const isApply = process.argv.includes('--apply');
  const isDryRun = !isApply;

  const siteUrl = process.env.WORDPRESS_SITE_URL || 'https://universododinheiro.com.br';
  const username = process.env.WORDPRESS_USERNAME;
  const password = process.env.WORDPRESS_APPLICATION_PASSWORD;

  if (!username || !password) {
    console.error('Credenciais do WordPress não configuradas.');
    process.exit(1);
  }

  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  console.log(`=== SCRIPT DE AUDITORIA E MIGRAÇÃO DE POSTS DO WORDPRESS ===`);
  console.log(`Modo: ${isDryRun ? '🔍 DRY-RUN (apenas simulação e relatório)' : '⚠️ APPLY (modificando posts no WordPress)'}`);
  console.log(`Site: ${siteUrl}\n`);

  // Busca todos os posts
  const response = await fetch(`${siteUrl}/wp-json/wp/v2/posts?per_page=100&status=publish,draft`, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    console.error(`Erro ao buscar posts: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const posts: WPPost[] = await response.json();
  console.log(`Total de posts encontrados: ${posts.length}\n`);

  const report: Array<{
    id: number;
    title: string;
    action: 'DRAFT_OFF_TOPIC' | 'UPDATE_CATEGORY_AND_CONTENT' | 'ALREADY_COMPLIANT';
    currentCat: string;
    targetCat: string;
    details: string;
  }> = [];

  for (const post of posts) {
    const rawTitle = post.title.rendered.replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").replace(/&amp;/g, '&');
    const scope = validateEditorialScope(rawTitle, [post.slug]);

    const currentCatSlugs = post.categories.map((c) => CATEGORY_ID_TO_SLUG[c] || `id-${c}`).join(', ');

    if (!scope.isAllowed) {
      report.push({
        id: post.id,
        title: rawTitle,
        action: 'DRAFT_OFF_TOPIC',
        currentCat: currentCatSlugs,
        targetCat: 'N/A',
        details: `Fora do escopo de finanças: ${scope.reason}. Recomendação: mudar status para draft (rascunho).`,
      });

      if (isApply && post.status !== 'draft') {
        console.log(`Mudando post ${post.id} ("${rawTitle}") para draft...`);
        await fetch(`${siteUrl}/wp-json/wp/v2/posts/${post.id}`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'draft' }),
        });
      }
    } else {
      const targetSlug = scope.matchedCategorySlug || 'saindo-das-dividas';
      const targetCatId = CATEGORY_MAP[targetSlug];
      const needsCategoryUpdate = post.categories.length !== 1 || post.categories[0] !== targetCatId;
      const content = post.content.rendered;
      const hasMarkdownOrRaw = content.includes('# ') || content.includes('\\n') || !content.includes('ud-aviso');

      if (needsCategoryUpdate || hasMarkdownOrRaw) {
        report.push({
          id: post.id,
          title: rawTitle,
          action: 'UPDATE_CATEGORY_AND_CONTENT',
          currentCat: currentCatSlugs,
          targetCat: targetSlug,
          details: `Categoria alvo: [${targetCatId}] (${targetSlug}). ${hasMarkdownOrRaw ? 'Necessita sanitização de HTML/aviso legal.' : 'Categoria atual divergente.'}`,
        });

        if (isApply) {
          const formatted = await formatArticleForWordPress(content, {
            title: rawTitle,
            categorySlug: targetSlug,
          });

          await fetch(`${siteUrl}/wp-json/wp/v2/posts/${post.id}`, {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              categories: [targetCatId],
              content: formatted.html,
            }),
          });
          console.log(`Post ${post.id} atualizado com categoria [${targetCatId}] e conteúdo sanitizado.`);
        }
      } else {
        report.push({
          id: post.id,
          title: rawTitle,
          action: 'ALREADY_COMPLIANT',
          currentCat: currentCatSlugs,
          targetCat: targetSlug,
          details: 'Em total conformidade com a nova taxonomia e estrutura.',
        });
      }
    }
  }

  console.table(
    report.map((r) => ({
      ID: r.id,
      Título: r.title.slice(0, 38) + (r.title.length > 38 ? '...' : ''),
      Ação: r.action,
      'Cat. Atual': r.currentCat,
      'Cat. Alvo': r.targetCat,
      Motivo: r.details.slice(0, 45) + (r.details.length > 45 ? '...' : ''),
    }))
  );

  console.log('\n--- RESUMO DA AUDITORIA ---');
  console.log(`Posts fora de escopo (mover para rascunho): ${report.filter((r) => r.action === 'DRAFT_OFF_TOPIC').length}`);
  console.log(`Posts de finanças a reclassificar/formatar: ${report.filter((r) => r.action === 'UPDATE_CATEGORY_AND_CONTENT').length}`);
  console.log(`Posts já 100% conformes: ${report.filter((r) => r.action === 'ALREADY_COMPLIANT').length}`);

  if (isDryRun) {
    console.log('\n💡 Para aplicar estas modificações nos posts existentes no WordPress, execute:');
    console.log('npx tsx scripts/migrate-posts.ts --apply\n');
  }
}

main().catch(console.error);
