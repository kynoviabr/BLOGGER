import { ResearchSource, FetchedSourceContent } from './research.types';
import { safeFetch, MAX_RESPONSE_BYTES, SSRFError, ContentTypeError, OversizedResponseError } from './ssrf-validator';
import { sanitizeUntrustedText } from './prompt-injection-sanitizer';
import { logger } from '@/lib/logger';

export class SourceFetcher {
  readonly name = 'SourceFetcher';

  /**
   * Baixa e processa o conteúdo real da URL original de uma ResearchSource.
   */
  async fetchSource(source: ResearchSource, timeoutMs = 8000): Promise<FetchedSourceContent | null> {
    const startTime = Date.now();
    logger.info(this.name, `Abrindo URL original: ${source.url} (Tier ${source.tier})`);

    try {
      const response = await safeFetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeoutMs,
        maxResponseBytes: MAX_RESPONSE_BYTES,
      });

      if (!response.ok) {
        logger.warn(this.name, `Fonte retornou HTTP ${response.status}: ${source.url}`);
        return null;
      }

      const contentType = response.headers.get('content-type') || 'text/html';
      const rawText = await response.text();
      const byteLength = Buffer.byteLength(rawText, 'utf8');

      if (byteLength > MAX_RESPONSE_BYTES) {
        logger.warn(this.name, `Conteúdo da fonte excede limite máximo (${byteLength} bytes): ${source.url}`);
        return null;
      }

      const finalUrl = response.url || source.url;

      // Extração de título da página
      const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const pageTitle = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        : source.title;

      // Detecção de data de publicação na página se não fornecida
      let publishedAt = source.publishedAt;
      if (!publishedAt) {
        const metaDateMatch = rawText.match(/<meta[^>]+(?:name|property)=["'](?:article:published_time|datePublished|pubdate|date)["'][^>]+content=["']([^"']+)["']/i);
        if (metaDateMatch) {
          publishedAt = metaDateMatch[1].split('T')[0];
        } else {
          const textDateMatch = rawText.match(/\b(\d{1,2}\s+de\s+[a-zç]+\.\s+de\s+20\d{2}|\d{2}\/\d{2}\/20\d{2}|20\d{2}-\d{2}-\d{2})\b/i);
          if (textDateMatch) {
            publishedAt = textDateMatch[1];
          }
        }
      }

      // Limpeza de tags desnecessárias do HTML
      const cleanedHtml = rawText
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
        .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
        .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ')
        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
        .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, ' ');

      // Extração de parágrafos, cabeçalhos e listas
      const blockMatches = [...cleanedHtml.matchAll(/<(?:p|h[1-6]|li|div)[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|li|div)>/gi)];
      const rawParagraphs: string[] = [];

      for (const match of blockMatches) {
        const text = match[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim();

        if (
          text.length >= 35 &&
          !text.includes('{') &&
          !text.includes('function(') &&
          !text.includes('var ') &&
          !text.includes('const ')
        ) {
          rawParagraphs.push(text);
        }
      }

      // Desduplica parágrafos mantendo a ordem
      const uniqueParagraphs = [...new Set(rawParagraphs)].slice(0, 30);
      const sanitizedParagraphs = uniqueParagraphs.map(p => sanitizeUntrustedText(p));
      const cleanedText = sanitizedParagraphs.join('\n\n');

      const isOfficial = source.tier === 1 || source.domain.endsWith('.gov.br') || source.domain.endsWith('.bcb.gov.br');

      const durationMs = Date.now() - startTime;
      logger.info(this.name, `Sucesso ao baixar ${source.url} (${byteLength} bytes, ${sanitizedParagraphs.length} parágrafos em ${durationMs}ms)`);

      return {
        sourceUrl: source.url,
        finalUrl,
        httpStatus: response.status,
        contentType,
        byteLength,
        title: pageTitle,
        publishedAt,
        accessedAt: source.accessedAt,
        cleanedText,
        paragraphs: sanitizedParagraphs,
        isOfficial,
        tier: source.tier,
        dnsValidated: true,
        redirectCount: 0,
      };
    } catch (err) {
      if (err instanceof SSRFError || err instanceof ContentTypeError || err instanceof OversizedResponseError) {
        logger.warn(this.name, `Segurança bloqueou download de ${source.url}: ${err.message}`);
      } else {
        logger.warn(this.name, `Erro ao baixar fonte ${source.url}: ${err instanceof Error ? err.message : String(err)}`);
      }
      return null;
    }
  }

  /**
   * Baixa concorrentemente um conjunto de fontes selecionadas com limite de concorrência.
   */
  async fetchSources(sources: ResearchSource[], maxConcurrency = 3): Promise<FetchedSourceContent[]> {
    const results: FetchedSourceContent[] = [];

    for (let i = 0; i < sources.length; i += maxConcurrency) {
      const chunk = sources.slice(i, i + maxConcurrency);
      const promises = chunk.map(s => this.fetchSource(s));
      const chunkResults = await Promise.all(promises);

      for (const res of chunkResults) {
        if (res) {
          results.push(res);
        }
      }
    }

    return results;
  }
}
