import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/** Acima deste valor a pauta é tratada como duplicada e o salvamento pede confirmação. */
export const HIGH_RISK_THRESHOLD = 0.75;

/** Até 1000 posts publicados (10 páginas de 100) entram na comparação. */
const WORDPRESS_MAX_PAGES = 10;

export interface ConflictingItem {
  source: 'WORDPRESS' | 'CALENDAR' | 'CONTENT' | 'BATCH';
  title: string;
  url?: string;
  status?: string;
  focusKeyword?: string;
  similarityScore: number; // 0 to 1
}

export interface CannibalizationCheckResult {
  isCannibalizing: boolean;
  riskLevel: 'HIGH' | 'MEDIUM' | 'NONE';
  score: number;
  reasons: string[];
  conflictingItems: ConflictingItem[];
}

/** Converte uma ideia (palavras-chave separadas por vírgula) no formato do guardião. */
export function toGuardInput(idea: { title: string; keywords?: string }) {
  const keywords = (idea.keywords ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  return { title: idea.title, focusKeyword: keywords[0], keywords };
}

export interface CorpusEntry {
  source: ConflictingItem['source'];
  calendarId?: string;
  title: string;
  status?: string;
  url?: string;
  focusKeyword?: string;
  normTitle: string;
  tokens: Set<string>;
}

export class CannibalizationGuardService {
  private static readonly STOP_WORDS = new Set([
    'a', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'do', 'dos',
    'e', 'em', 'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'por',
    'que', 'se', 'um', 'uma', 'uns', 'umas', 'the', 'and', 'for', 'with', 'in', 'on', 'to'
  ]);

  /**
   * Normaliza e extrai tokens significativos de um texto
   */
  private static extractTokens(text: string): Set<string> {
    if (!text) return new Set();

    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ');

    const words = normalized
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2 && !this.STOP_WORDS.has(w));

    return new Set(words);
  }

  /**
   * Calcula o coeficiente Dice / Jaccard entre dois conjuntos de tokens (0 a 1)
   */
  private static computeTokenSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) {
        intersection++;
      }
    }

    // Coeficiente de Sobreposição (Sørensen–Dice)
    return (2 * intersection) / (tokensA.size + tokensB.size);
  }

  private static normalize(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  /** Monta uma entrada de comparação a partir de um título e texto extra (palavras-chave). */
  static buildEntry(
    source: ConflictingItem['source'],
    title: string,
    extraText = '',
    meta: Pick<CorpusEntry, 'calendarId' | 'status' | 'url' | 'focusKeyword'> = {}
  ): CorpusEntry {
    return { source, title, ...meta, normTitle: this.normalize(title), tokens: this.extractTokens(`${title} ${extraText}`) };
  }

  /**
   * Carrega tudo o que já existe NO MESMO BLOG para comparação: pautas (inclusive
   * ideias salvas), artigos (em revisão, agendados, publicados) e posts do WordPress do blog.
   */
  static async loadBlogCorpus(blogId: string): Promise<CorpusEntry[]> {
    const corpus: CorpusEntry[] = [];
    const supabase = await getSupabaseServerClient();

    // Erros de banco interrompem a checagem (fail-closed): um corpus vazio por
    // falha deixaria passar duplicatas sem a confirmação do usuário.
    const { data: calendarItems, error: calendarError } = await supabase
      .from('editorial_calendar')
      .select('id, proposed_title, topic, keywords, status')
      .eq('blog_id', blogId)
      .neq('status', 'FAILED')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (calendarError) throw new Error(`Falha ao consultar pautas do blog: ${calendarError.message}`);

    for (const item of calendarItems ?? []) {
      const title = item.proposed_title || item.topic || '';
      const keywords = Array.isArray(item.keywords) ? item.keywords.join(' ') : '';
      corpus.push(this.buildEntry('CALENDAR', title, keywords, { calendarId: item.id, status: item.status }));
    }

    const { data: contentItems, error: contentError } = await supabase
      .from('content_items')
      .select('id, title, focus_keyword, status, editorial_calendar_id, external_post_url')
      .eq('blog_id', blogId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (contentError) throw new Error(`Falha ao consultar artigos do blog: ${contentError.message}`);

    for (const item of contentItems ?? []) {
      if (!item.title || item.title === 'Gerando...') continue;
      corpus.push(
        this.buildEntry('CONTENT', item.title, item.focus_keyword ?? '', {
          calendarId: item.editorial_calendar_id ?? undefined,
          status: item.status,
          url: item.external_post_url ?? undefined,
          focusKeyword: item.focus_keyword ?? undefined,
        })
      );
    }

    const { data: blog, error: blogError } = await supabase
      .from('blogs')
      .select('domain, editorial_config')
      .eq('id', blogId)
      .maybeSingle();
    if (blogError) throw new Error(`Falha ao consultar o blog: ${blogError.message}`);

    // Posts publicados no WordPress DESTE blog (API pública, sem credenciais),
    // página por página. Falhas do site externo não bloqueiam a checagem.
    const editorial = (blog?.editorial_config ?? {}) as { wordpress?: { wp_site_url?: string } };
    const rawUrl = (editorial.wordpress?.wp_site_url || blog?.domain || '').trim();
    if (rawUrl) {
      const siteUrl = rawUrl.replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://');
      try {
        for (let page = 1; page <= WORDPRESS_MAX_PAGES; page++) {
          const response = await fetch(
            `${siteUrl}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,title,link`,
            { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
          );
          if (!response.ok) break;
          const posts = await response.json();
          for (const post of Array.isArray(posts) ? posts : []) {
            const title = String(post?.title?.rendered ?? '');
            if (!title) continue;
            corpus.push(this.buildEntry('WORDPRESS', title, '', { status: 'PUBLISHED', url: post.link || undefined }));
          }
          const totalPages = Number(response.headers.get('X-WP-TotalPages') ?? '1');
          if (!Array.isArray(posts) || page >= totalPages) break;
        }
      } catch (wpErr) {
        logger.warn('CannibalizationGuardService', `Aviso ao consultar WordPress do blog: ${String(wpErr)}`);
      }
    }

    return corpus;
  }

  /** Compara uma pauta com um corpus já carregado. */
  static scoreAgainst(
    corpus: CorpusEntry[],
    idea: { title: string; focusKeyword?: string; keywords?: string[] },
    options: { excludeCalendarId?: string } = {}
  ): CannibalizationCheckResult {
    const { title, focusKeyword, keywords = [] } = idea;
    const queryTokens = this.extractTokens(`${title} ${focusKeyword || ''} ${keywords.join(' ')}`);
    const targetFocusKwNorm = focusKeyword ? this.normalize(focusKeyword) : '';
    const targetTitleNorm = this.normalize(title);
    const conflictingItems: ConflictingItem[] = [];
    const reasons: string[] = [];

    for (const entry of corpus) {
      if (options.excludeCalendarId && entry.calendarId === options.excludeCalendarId) continue;

      const similarity = this.computeTokenSimilarity(queryTokens, entry.tokens);
      const sameTitle = targetTitleNorm.length > 0 && entry.normTitle === targetTitleNorm;
      const directKwMatch = targetFocusKwNorm.length > 5 && entry.normTitle.includes(targetFocusKwNorm);
      const finalScore = sameTitle ? 1 : directKwMatch ? Math.max(similarity, 0.85) : similarity;

      if (finalScore >= 0.5) {
        conflictingItems.push({
          source: entry.source,
          title: entry.title,
          url: entry.url,
          status: entry.status,
          focusKeyword: entry.focusKeyword,
          similarityScore: Number(finalScore.toFixed(2)),
        });
      }
    }

    conflictingItems.sort((a, b) => b.similarityScore - a.similarityScore);

    const maxScore = conflictingItems.length > 0 ? conflictingItems[0].similarityScore : 0;
    let riskLevel: 'HIGH' | 'MEDIUM' | 'NONE' = 'NONE';
    let isCannibalizing = false;

    if (maxScore >= HIGH_RISK_THRESHOLD) {
      riskLevel = 'HIGH';
      isCannibalizing = true;
      reasons.push(
        `Alto risco de canibalização detectado (${Math.round(maxScore * 100)}% de similaridade). Já existe conteúdo neste blog competindo pela mesma intenção de busca.`
      );
    } else if (maxScore >= 0.5) {
      riskLevel = 'MEDIUM';
      isCannibalizing = true;
      reasons.push(
        `Alerta de sobreposição temática moderada (${Math.round(maxScore * 100)}% de similaridade). Recomenda-se ajustar o ângulo da pauta ou focar em cauda longa diferente.`
      );
    }

    return { isCannibalizing, riskLevel, score: maxScore, reasons, conflictingItems };
  }

  /**
   * Verifica várias pautas de uma vez contra o blog e também entre si (duas
   * ideias quase iguais no mesmo lote contam como duplicadas).
   */
  static async checkMany(
    blogId: string,
    ideas: Array<{ title: string; focusKeyword?: string; keywords?: string[] }>
  ): Promise<CannibalizationCheckResult[]> {
    const corpus = await this.loadBlogCorpus(blogId);
    const results: CannibalizationCheckResult[] = [];

    for (const idea of ideas) {
      results.push(this.scoreAgainst(corpus, idea));
      corpus.push(
        this.buildEntry('BATCH', idea.title, `${idea.focusKeyword || ''} ${(idea.keywords ?? []).join(' ')}`, { status: 'NEW' })
      );
    }

    return results;
  }

  /** Auditoria de uma única pauta contra o mesmo blog. */
  static async checkCannibalization(params: {
    blogId: string;
    title: string;
    focusKeyword?: string;
    keywords?: string[];
    currentCalendarId?: string;
  }): Promise<CannibalizationCheckResult> {
    const corpus = await this.loadBlogCorpus(params.blogId);
    return this.scoreAgainst(corpus, params, { excludeCalendarId: params.currentCalendarId });
  }
}
