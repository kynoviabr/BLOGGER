/**
 * ARQUITETURA DO PIPELINE EDITORIAL:
 * IDEA -> RESEARCH / FACTUAL CONTEXT (future) -> ARTICLE -> QUALITY GATE -> IMAGE -> PUBLISH
 *
 * 1. IDEA: Geração unitária e resiliente da pauta com intenção de busca, CTR e diversidade.
 * 2. RESEARCH / FACTUAL CONTEXT: Injeção de fontes atualizadas, regras e dados vigentes (campo sourcesOrResearch).
 * 3. ARTICLE: Redação editorial profunda, sem muletas de IA, cumprindo target word count.
 * 4. QUALITY GATE: Validação real de word count, anacronismos temporais, pt-BR e metadados.
 * 5. IMAGE: Geração de imagem via OpenAI (DALL-E 3) com otimização JPEG/MozJPEG.
 * 6. PUBLISH: Publicação no WordPress com featured_media e metadados SEO.
 */

import {
  AIProvider,
  GeneratedArticle,
  ArticleGenerationContext,
} from './ai-provider.interface';
import { AIProviderError } from '@/lib/errors/ai.errors';
import { logger } from '@/lib/logger';
import {
  DEEPSEEK_MASTER_SYSTEM_PROMPT,
  buildDeepSeekArticleUserPrompt,
  DEEPSEEK_IDEA_SYSTEM_PROMPT,
  buildDeepSeekIdeaUserPrompt,
  DeepSeekArticlePromptOptions,
  DeepSeekIdeaPromptOptions,
} from '@/prompts/deepseek-prompts';

export interface DeepSeekProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface DeepSeekArticleResult extends GeneratedArticle {
  actualWordCount: number;
  targetWordCount: number;
  qualityGateStatus: 'PASS' | 'SHORT_WARNING' | 'FAIL_QUALITY_GATE' | 'LONG_WARNING';
  qualityGateNotes: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
}

export interface DeepSeekIdeaResult {
  title: string;
  keywords: string;
  description: string;
  type: string;
  durationMs: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Função utilitária precisa para contagem real de palavras no conteúdo.
 * Remove cabeçalhos Markdown, tags HTML e pontuações isoladas.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  const cleaned = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`~[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/**
 * Avalia o quality gate de contagem de palavras com base no range aceitável.
 */
export function evaluateWordCountQualityGate(
  actual: number,
  min: number,
  max: number
): { status: 'PASS' | 'SHORT_WARNING' | 'FAIL_QUALITY_GATE' | 'LONG_WARNING'; note: string } {
  if (actual >= min && actual <= max) {
    return {
      status: 'PASS',
      note: `Word count real (${actual} palavras) perfeitamente dentro da faixa aceitável (${min}–${max}).`,
    };
  }
  if (actual >= 1300 && actual < min) {
    return {
      status: 'SHORT_WARNING',
      note: `Word count (${actual} palavras) ligeiramente abaixo do mínimo desejado (${min}), mas acima do corte crítico de 1300.`,
    };
  }
  if (actual < 1300) {
    return {
      status: 'FAIL_QUALITY_GATE',
      note: `Word count (${actual} palavras) insuficiente! Abaixo do limite crítico de 1300 palavras.`,
    };
  }
  return {
    status: 'LONG_WARNING',
    note: `Word count (${actual} palavras) acima da faixa recomendada (${max}), verificar concisão.`,
  };
}

export class DeepSeekProvider implements AIProvider {
  readonly name = 'DeepSeekProvider';
  readonly defaultModel: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly temperature: number;
  private readonly maxRetries: number;
  private readonly defaultTimeoutMs: number;

  constructor(config: DeepSeekProviderConfig = {}) {
    const key = config.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!key) {
      throw new AIProviderError(
        'DEEPSEEK_API_KEY não configurada no ambiente nem fornecida na inicialização.',
        { provider: this.name, statusCode: 401, isRetryable: false }
      );
    }

    this.apiKey = key;
    this.defaultModel = config.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    this.baseUrl = (config.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
    this.temperature = config.temperature ?? 0.5;
    this.maxRetries = config.maxRetries ?? 2;
    this.defaultTimeoutMs = config.timeoutMs ?? 60000;
  }

  /**
   * Executa chamada HTTP resiliente à API do DeepSeek com timeout estrito e exponential backoff.
   */
  private async executeChatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: {
      temperature?: number;
      maxTokens?: number;
      timeoutMs?: number;
      maxRetries?: number;
      operationName: string;
    }
  ): Promise<{ content: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; durationMs: number }> {
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : this.maxRetries;
    const url = `${this.baseUrl}/chat/completions`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const attemptStart = Date.now();

      try {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => {
          controller.abort();
        }, timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.defaultModel,
            messages,
            temperature: options.temperature ?? this.temperature,
            max_tokens: options.maxTokens,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        }).finally(() => {
          clearTimeout(timeoutHandle);
        });

        const durationMs = Date.now() - attemptStart;

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          const status = response.status;
          const isRetryable = status === 429 || status >= 500;

          logger.warn(
            this.name,
            `[${options.operationName}] Tentativa ${attempt + 1} falhou: HTTP ${status} em ${durationMs}ms: ${errorText.slice(0, 150)}`
          );

          if (!isRetryable || attempt >= maxRetries) {
            throw new AIProviderError(`DeepSeek API retornou HTTP ${status}: ${errorText}`, {
              provider: this.name,
              statusCode: status,
              isRetryable,
            });
          }

          // Backoff exponencial antes de tentar novamente
          const delayMs = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        const content = choice?.message?.content;

        if (!content) {
          throw new AIProviderError('Resposta vazia da API DeepSeek.', {
            provider: this.name,
            statusCode: 502,
            isRetryable: true,
          });
        }

        logger.info(
          this.name,
          `[${options.operationName}] Sucesso HTTP 200 em ${durationMs}ms (Tokens: prompt=${data.usage?.prompt_tokens}, completion=${data.usage?.completion_tokens})`
        );

        return {
          content,
          usage: data.usage,
          durationMs,
        };
      } catch (err: unknown) {
        const durationMs = Date.now() - attemptStart;
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const errorMsg = isAbort
          ? `Timeout de ${timeoutMs}ms excedido aguardando resposta da API DeepSeek.`
          : err instanceof Error
          ? err.message
          : String(err);

        lastError = new Error(errorMsg);

        logger.warn(
          this.name,
          `[${options.operationName}] Erro na tentativa ${attempt + 1} (${durationMs}ms): ${errorMsg}`
        );

        if (attempt >= maxRetries) {
          break;
        }

        const delayMs = 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    throw new AIProviderError(
      `Falha na comunicação com o DeepSeek após ${maxRetries + 1} tentativas: ${lastError?.message}`,
      { provider: this.name, statusCode: 504, isRetryable: true, originalError: lastError }
    );
  }

  /**
   * Extrai e faz o parse seguro de JSON retornado pelo modelo.
   */
  private parseJSONResponse<T>(rawContent: string, operationName: string): T {
    let clean = rawContent.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
      return JSON.parse(clean) as T;
    } catch (parseErr) {
      throw new AIProviderError(
        `Falha ao decodificar JSON retornado pelo DeepSeek em ${operationName}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        {
          provider: this.name,
          statusCode: 500,
          isRetryable: false,
          originalError: rawContent.slice(0, 300),
        }
      );
    }
  }

  /**
   * Gera um artigo completo de alta qualidade com validação rígida de quality gates.
   */
  async generateArticle(
    title: string,
    keywords: string[],
    context?: ArticleGenerationContext
  ): Promise<DeepSeekArticleResult> {
    const targetWordCount = typeof context?.targetWordCount === 'number' ? context.targetWordCount : 1800;
    const minimumWordCount = typeof context?.minimumWordCount === 'number' ? context.minimumWordCount : 1500;
    const maximumWordCount = typeof context?.maximumWordCount === 'number' ? context.maximumWordCount : 2200;
    const currentDate = (context?.currentDate as string) || new Date().toISOString().split('T')[0];

    logger.info(this.name, `Iniciando produção de artigo editorial com DeepSeek: "${title}"`, {
      targetWordCount,
      range: `${minimumWordCount}-${maximumWordCount}`,
      category: context?.category,
    });

    const promptOptions: DeepSeekArticlePromptOptions = {
      blogName: (context?.blogName as string) || 'Universo do Dinheiro',
      niche: context?.niche || 'Finanças Pessoais e Economia',
      blogDescription: (context?.blogDescription as string) || (context?.purpose as string),
      audience: context?.audience || 'Brasileiros em busca de educação financeira, crédito e investimentos',
      language: context?.language || 'pt-BR',
      currentDate,
      topicTitle: title,
      category: context?.category,
      topicDescription: context?.notes,
      primaryKeyword: keywords[0] || title,
      secondaryKeywords: keywords.slice(1),
      contentType: (context?.tone as string) || 'Guia Completo',
      searchIntent: (context?.searchIntent as string) || 'Informacional e Prática',
      targetWordCount,
      minimumWordCount,
      maximumWordCount,
      sourcesOrResearch: context?.sourcesOrResearch as string,
      notes: context?.notes,
    };

    const userPrompt = buildDeepSeekArticleUserPrompt(promptOptions);

    const completion = await this.executeChatCompletion(
      [
        { role: 'system', content: DEEPSEEK_MASTER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: this.temperature,
        timeoutMs: 50000, // 50s estritos (orçamento Vercel Serverless maxDuration = 60s)
        maxRetries: 0, // 0 retries para fail-fast dentro do orçamento Vercel
        operationName: 'generateArticle',
      }
    );

    const parsed = this.parseJSONResponse<{
      title: string;
      slug?: string;
      metaTitle?: string;
      metaDescription?: string;
      primaryKeyword?: string;
      secondaryKeywords?: string[];
      searchIntent?: string;
      excerpt?: string;
      content: string;
      faq?: Array<{ question: string; answer: string }>;
      estimatedWordCount?: number;
    }>(completion.content, 'generateArticle');

    // Validações pós-geração fundamentais
    if (!parsed.title || !parsed.content || parsed.content.length < 100) {
      throw new AIProviderError('DeepSeek retornou artigo sem título ou com conteúdo vazio/insuficiente.', {
        provider: this.name,
        statusCode: 502,
        isRetryable: false,
      });
    }

    // Contagem real de palavras no código
    const actualWordCount = countWords(parsed.content);
    const gateEval = evaluateWordCountQualityGate(actualWordCount, minimumWordCount, maximumWordCount);

    const qualityGateNotes: string[] = [gateEval.note];

    // Verificação de anacronismo evidente no título do artigo
    const currentYear = parseInt(currentDate.split('-')[0], 10);
    const titleYearMatch = parsed.title.match(/\b(20\d{2})\b/);
    if (titleYearMatch) {
      const titleYear = parseInt(titleYearMatch[1], 10);
      if (titleYear < currentYear) {
        qualityGateNotes.push(
          `AVISO ANACRONISMO: O título menciona o ano ${titleYear}, anterior ao ano de referência atual (${currentYear}).`
        );
      }
    }

    // Detecção básica de idioma pt-BR
    const commonPtBrWords = ['que', 'para', 'com', 'não', 'uma', 'como', 'você', 'seu', 'sua'];
    const lowerContent = parsed.content.toLowerCase();
    const hasPtBr = commonPtBrWords.some((w) => lowerContent.includes(` ${w} `));
    if (!hasPtBr) {
      qualityGateNotes.push('AVISO: O conteúdo pode não estar no idioma Português do Brasil esperado.');
    }

    // Validação de meta description
    const metaDescription = parsed.metaDescription?.trim() || '';
    if (!metaDescription) {
      qualityGateNotes.push('AVISO: Meta description vazia.');
    }

    // Auditoria de URLs: verificar que o modelo não inventou links ou referências não verificadas
    const markdownUrlRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let urlMatch: RegExpExecArray | null;
    const allowedUrls = (context?.sourcesOrResearch as string) || '';
    const unverifiedUrls: string[] = [];

    while ((urlMatch = markdownUrlRegex.exec(parsed.content)) !== null) {
      const foundUrl = urlMatch[2];
      if (!allowedUrls.includes(foundUrl)) {
        unverifiedUrls.push(foundUrl);
      }
    }

    if (unverifiedUrls.length > 0) {
      qualityGateNotes.push(`AVISO AUDITORIA URLs: URLs detectadas no texto que não vieram do Research Brief: ${unverifiedUrls.join(', ')}`);
    }

    const slug = (
      parsed.slug ||
      title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
    ).trim();

    const readingTimeMinutes = Math.ceil(actualWordCount / 200);

    const result: DeepSeekArticleResult = {
      title: parsed.title.trim(),
      slug,
      metaDescription,
      content: parsed.content.trim(),
      keywords: Array.isArray(parsed.secondaryKeywords) && parsed.primaryKeyword
        ? [parsed.primaryKeyword, ...parsed.secondaryKeywords]
        : keywords,
      readingTimeMinutes,
      actualWordCount,
      targetWordCount,
      qualityGateStatus: gateEval.status,
      qualityGateNotes,
      durationMs: completion.durationMs,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : undefined,
    };

    logger.info(this.name, `Artigo produzido com sucesso pelo DeepSeek: "${result.title}"`, {
      actualWordCount,
      qualityGateStatus: gateEval.status,
      durationMs: completion.durationMs,
    });

    return result;
  }

  /**
   * Gera EXATAMENTE UMA ideia de pauta sequencial de alta relevância com DeepSeek.
   */
  async generateIdea(context: {
    niche?: string;
    audience?: string;
    purpose?: string;
    category?: string;
    language?: string;
    blogName?: string;
    currentDate?: string;
    existingIdeas?: Array<{ title: string; keywords?: string; type?: string }>;
    queuePosition?: number;
    totalRequested?: number;
  }): Promise<DeepSeekIdeaResult> {
    const currentDate = context.currentDate || new Date().toISOString().split('T')[0];
    const promptOptions: DeepSeekIdeaPromptOptions = {
      blogName: context.blogName,
      niche: context.niche,
      audience: context.audience,
      purpose: context.purpose,
      category: context.category,
      language: context.language,
      currentDate,
      existingIdeas: context.existingIdeas,
      queuePosition: context.queuePosition,
      totalRequested: context.totalRequested,
    };

    const userPrompt = buildDeepSeekIdeaUserPrompt(promptOptions);

    const completion = await this.executeChatCompletion(
      [
        { role: 'system', content: DEEPSEEK_IDEA_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.7,
        timeoutMs: 20000, // 20s rígidos por pauta
        maxRetries: 1, // máx 1 retry (total 2 tentativas)
        operationName: 'generateIdea',
      }
    );

    const parsed = this.parseJSONResponse<{
      title: string;
      keywords: string;
      description: string;
      type: string;
    }>(completion.content, 'generateIdea');

    if (!parsed.title || !parsed.keywords || !parsed.description) {
      throw new AIProviderError('DeepSeek retornou pauta com campos obrigatórios ausentes.', {
        provider: this.name,
        statusCode: 502,
        isRetryable: false,
      });
    }

    // Verificação de anacronismo na pauta
    const currentYear = parseInt(currentDate.split('-')[0], 10);
    const yearMatch = parsed.title.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1], 10);
      if (year < currentYear) {
        logger.warn(
          this.name,
          `Aviso: Pauta gerada com ano anacrônico detectado (${year} < ${currentYear}): "${parsed.title}"`
        );
      }
    }

    return {
      title: parsed.title.trim(),
      keywords: parsed.keywords.trim(),
      description: parsed.description.trim(),
      type: parsed.type?.trim() || 'Guia Completo',
      durationMs: completion.durationMs,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : undefined,
    };
  }

  /**
   * Suporte a geração em lote (opcional).
   */
  async generateIdeas(context: {
    niche?: string;
    audience?: string;
    purpose?: string;
    category?: string;
    language?: string;
    count?: number;
  }): Promise<Array<{ title: string; keywords: string; description: string; type: string }>> {
    const count = context.count || 5;
    const ideas: Array<{ title: string; keywords: string; description: string; type: string }> = [];

    for (let i = 1; i <= count; i++) {
      const one = await this.generateIdea({
        ...context,
        queuePosition: i,
        totalRequested: count,
        existingIdeas: ideas,
      });
      ideas.push({
        title: one.title,
        keywords: one.keywords,
        description: one.description,
        type: one.type,
      });
    }

    return ideas;
  }
}
