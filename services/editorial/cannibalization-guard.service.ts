import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export interface ConflictingItem {
  source: 'WORDPRESS' | 'CALENDAR';
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

  /**
   * Executa a auditoria completa de canibalização contra o WordPress publicado e o Calendário Editorial
   */
  static async checkCannibalization(params: {
    title: string;
    focusKeyword?: string;
    keywords?: string[];
    currentCalendarId?: string;
  }): Promise<CannibalizationCheckResult> {
    const { title, focusKeyword, keywords = [], currentCalendarId } = params;
    const conflictingItems: ConflictingItem[] = [];
    const reasons: string[] = [];

    const queryTokens = this.extractTokens(`${title} ${focusKeyword || ''} ${keywords.join(' ')}`);
    const targetFocusKwNorm = focusKeyword
      ? focusKeyword.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      : '';

    // 1. Checagem no WordPress via REST API oficial
    const wpSiteUrl = process.env.WORDPRESS_SITE_URL?.replace(/\/+$/, '');
    if (wpSiteUrl) {
      try {
        const searchTerm = focusKeyword || title.split(/\s+/).slice(0, 4).join(' ');
        const endpoint = `${wpSiteUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(searchTerm)}&per_page=8`;
        
        const response = await fetch(endpoint, {
          headers: {
            Accept: 'application/json',
          },
        });

        if (response.ok) {
          const posts = await response.json();
          if (Array.isArray(posts)) {
            for (const post of posts) {
              const postTitle = post.title?.rendered || '';
              const postUrl = post.link || '';
              const postTokens = this.extractTokens(postTitle);
              const similarity = this.computeTokenSimilarity(queryTokens, postTokens);

              // Verifica se a palavra-chave foco aparece diretamente no título do post
              const postTitleNorm = postTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const directKwMatch = targetFocusKwNorm.length > 5 && postTitleNorm.includes(targetFocusKwNorm);

              const finalScore = directKwMatch ? Math.max(similarity, 0.85) : similarity;

              if (finalScore >= 0.5) {
                conflictingItems.push({
                  source: 'WORDPRESS',
                  title: postTitle,
                  url: postUrl,
                  status: 'PUBLISHED',
                  similarityScore: Number(finalScore.toFixed(2)),
                });
              }
            }
          }
        }
      } catch (wpErr) {
        logger.warn('CannibalizationGuardService', `Aviso ao consultar WordPress: ${String(wpErr)}`);
      }
    }

    // 2. Checagem no Supabase (editorial_calendar)
    try {
      const supabase = await getSupabaseServerClient();
      const { data: calendarItems } = await supabase
        .from('editorial_calendar')
        .select('id, proposed_title, topic, keywords, status')
        .not('status', 'in', '("FAILED","IDEA")')
        .limit(50);

      if (calendarItems && calendarItems.length > 0) {
        for (const item of calendarItems) {
          if (currentCalendarId && item.id === currentCalendarId) continue;

          const itemTitle = item.proposed_title || item.topic || '';
          const itemKeywords = Array.isArray(item.keywords) ? item.keywords.join(' ') : '';
          const itemTokens = this.extractTokens(`${itemTitle} ${itemKeywords}`);
          const similarity = this.computeTokenSimilarity(queryTokens, itemTokens);

          const itemTitleNorm = itemTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const directKwMatch = targetFocusKwNorm.length > 5 && itemTitleNorm.includes(targetFocusKwNorm);
          const finalScore = directKwMatch ? Math.max(similarity, 0.88) : similarity;

          if (finalScore >= 0.5) {
            conflictingItems.push({
              source: 'CALENDAR',
              title: itemTitle,
              status: item.status,
              similarityScore: Number(finalScore.toFixed(2)),
            });
          }
        }
      }
    } catch (dbErr) {
      logger.warn('CannibalizationGuardService', `Aviso ao consultar Supabase: ${String(dbErr)}`);
    }

    // Ordena do maior para o menor risco
    conflictingItems.sort((a, b) => b.similarityScore - a.similarityScore);

    const maxScore = conflictingItems.length > 0 ? conflictingItems[0].similarityScore : 0;
    let riskLevel: 'HIGH' | 'MEDIUM' | 'NONE' = 'NONE';
    let isCannibalizing = false;

    if (maxScore >= 0.75) {
      riskLevel = 'HIGH';
      isCannibalizing = true;
      reasons.push(
        `Alto risco de canibalização detectado (${Math.round(maxScore * 100)}% de similaridade). Já existe conteúdo ativo competindo pela mesma intenção de busca.`
      );
    } else if (maxScore >= 0.5) {
      riskLevel = 'MEDIUM';
      isCannibalizing = true;
      reasons.push(
        `Alerta de sobreposição temática moderada (${Math.round(maxScore * 100)}% de similaridade). Recomenda-se ajustar o ângulo da pauta ou focar em cauda longa diferente.`
      );
    }

    return {
      isCannibalizing,
      riskLevel,
      score: maxScore,
      reasons,
      conflictingItems,
    };
  }
}
