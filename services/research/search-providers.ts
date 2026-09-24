import { SearchProvider, WebSearchResult } from "./research.types";
import { safeFetch, validateSafeUrl } from "./ssrf-validator";
import { logger } from "@/lib/logger";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

/**
 * Provider de busca web em tempo real via Bing HTML.
 * Sem chaves de API, altíssima disponibilidade, sem bloqueio por captcha/202,
 * suporte nativo a domínios regulatórios (.gov.br, .bcb.gov.br) e SSRF safe.
 */
export class BingSearchProvider implements SearchProvider {
  readonly name = "BingSearchProvider";

  async search(query: string, options: { limit?: number; language?: string } = {}): Promise<WebSearchResult[]> {
    const limit = options.limit || 8;
    // Remove pontuações que atrapalham, preservando operadores como site:
    const cleanQuery = query.replace(/[?!,"'“”()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
    const url = "https://www.bing.com/search?q=" + encodeURIComponent(cleanQuery);

    try {
      const response = await safeFetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      if (!response.ok) {
        logger.warn(this.name, `Falha na busca HTTP ${response.status}`);
        return [];
      }

      const html = await response.text();
      const results: WebSearchResult[] = [];
      const blocks = html.split('<li class="b_algo"');

      for (let i = 1; i < blocks.length && results.length < limit; i++) {
        const block = blocks[i];
        const linkMatch = block.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/i);
        const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

        if (!linkMatch) continue;

        let rawUrl = linkMatch[1].replace(/&amp;/g, "&");
        if (rawUrl.includes("bing.com/ck/a?")) {
          try {
            const parsed = new URL(rawUrl);
            const u = parsed.searchParams.get("u");
            if (u) {
              const base64Str = u.startsWith("a1") ? u.slice(2) : u;
              rawUrl = Buffer.from(base64Str, "base64").toString("utf-8");
            }
          } catch {
            // mantém rawUrl se falhar parsing
          }
        }

        // Validação SSRF da URL encontrada
        const validation = validateSafeUrl(rawUrl);
        if (!validation.isValid) {
          continue;
        }

        const title = decodeHtmlEntities(linkMatch[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
        const snippet = snippetMatch
          ? decodeHtmlEntities(snippetMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
          : "";

        // Tenta detectar data no snippet
        let publishedAt: string | undefined;
        const dateMatch = snippet.match(/\b(\d{1,2}\s+de\s+[a-zç]+\.\s+de\s+20\d{2}|\d{2}\/\d{2}\/20\d{2}|20\d{2}-\d{2}-\d{2})\b/i);
        if (dateMatch) {
          publishedAt = dateMatch[1];
        }

        if (title && rawUrl && snippet) {
          results.push({
            title,
            url: rawUrl,
            snippet,
            publishedAt,
          });
        }
      }

      return results;
    } catch (err) {
      logger.error(this.name, `Erro ao executar busca para a query "${query}": ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
}

/**
 * Provider de busca web em tempo real via DuckDuckGo HTML.
 * Não requer chaves de API, possui excelente cobertura de domínios brasileiros (.gov.br, etc.)
 * e não sofre bloqueios por quota de modelos de IA.
 */
export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly name = "DuckDuckGoSearchProvider";

  async search(query: string, options: { limit?: number; language?: string } = {}): Promise<WebSearchResult[]> {
    const limit = options.limit || 8;
    const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);

    try {
      const response = await safeFetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        logger.warn(this.name, `Falha na busca HTTP ${response.status}`);
        return [];
      }

      const html = await response.text();
      const results: WebSearchResult[] = [];

      // Regex para capturar resultados da página HTML do DuckDuckGo
      const resultRegex = /<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;

      while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
        let rawUrl = match[1];
        if (rawUrl.includes("uddg=")) {
          try {
            const parsed = new URL("https://duckduckgo.com" + rawUrl);
            rawUrl = decodeURIComponent(parsed.searchParams.get("uddg") || rawUrl);
          } catch {
            // mantém rawUrl se falhar
          }
        }

        // Validação SSRF da URL encontrada
        const validation = validateSafeUrl(rawUrl);
        if (!validation.isValid) {
          continue;
        }

        const title = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        const snippet = match[3].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

        // Tenta detectar data no snippet (ex: "15 de jan. de 2026", "2026-03-01", etc.)
        let publishedAt: string | undefined;
        const dateMatch = snippet.match(/\b(\d{1,2}\s+de\s+[a-zç]+\.\s+de\s+20\d{2}|\d{2}\/\d{2}\/20\d{2}|20\d{2}-\d{2}-\d{2})\b/i);
        if (dateMatch) {
          publishedAt = dateMatch[1];
        }

        if (title && rawUrl && snippet) {
          results.push({
            title,
            url: rawUrl,
            snippet,
            publishedAt,
          });
        }
      }

      return results;
    } catch (err) {
      logger.error(this.name, `Erro ao executar busca para a query "${query}": ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
}

/**
 * Provider de busca via Tavily (quando configurado via TAVILY_API_KEY ou SEARCH_API_KEY).
 */
export class TavilySearchProvider implements SearchProvider {
  readonly name = "TavilySearchProvider";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, options: { limit?: number; language?: string } = {}): Promise<WebSearchResult[]> {
    const limit = options.limit || 8;
    try {
      const res = await safeFetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: limit,
          search_depth: "basic",
          include_domains: [],
        }),
      });

      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        publishedAt: r.published_date,
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Factory para criação do provedor de busca mais adequado.
 */
export function createSearchProvider(): SearchProvider {
  const tavilyKey = process.env.TAVILY_API_KEY || process.env.SEARCH_API_KEY;
  if (tavilyKey) {
    logger.info("SearchProvider", "Utilizando TavilySearchProvider configurado via API key");
    return new TavilySearchProvider(tavilyKey);
  }

  if (process.env.SEARCH_PROVIDER === "duckduckgo") {
    logger.info("SearchProvider", "Utilizando DuckDuckGoSearchProvider por configuração de ambiente");
    return new DuckDuckGoSearchProvider();
  }

  // BingSearchProvider como padrão resiliente e livre de captcha
  return new BingSearchProvider();
}
