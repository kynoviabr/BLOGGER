import { GoogleGenAI, Type } from '@google/genai';
import {
  AIProvider,
  GeneratedArticle,
  ArticleGenerationContext,
} from './ai-provider.interface';
import { AIProviderError } from '@/lib/errors/ai.errors';
import {
  YMYL_FINANCE_SYSTEM_PROMPT,
  buildYMYLFinanceUserPrompt,
} from '@/prompts/article-prompts';
import { logger } from '@/lib/logger';

export interface GeminiProviderConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
}

export class GeminiProvider implements AIProvider {
  readonly name = 'GeminiProvider';
  readonly defaultModel: string;
  private readonly client: GoogleGenAI;
  private readonly temperature: number;

  constructor(config: GeminiProviderConfig = {}) {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        'GEMINI_API_KEY não configurada nas variáveis de ambiente nem passada na inicialização.',
        { provider: this.name, statusCode: 401, isRetryable: false }
      );
    }

    this.defaultModel = config.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    this.temperature = config.temperature ?? 0.4;
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateArticle(
    title: string,
    keywords: string[],
    context?: ArticleGenerationContext
  ): Promise<GeneratedArticle> {
    logger.info(this.name, `Iniciando geração de artigo: "${title}"`, {
      model: this.defaultModel,
      keywordsCount: keywords.length,
      language: context?.language || 'pt-BR',
    });

    const userPrompt = buildYMYLFinanceUserPrompt({
      title,
      keywords,
      niche: context?.niche,
      audience: context?.audience,
      language: context?.language,
      category: context?.category,
      notes: context?.notes,
    });

    // Lista de modelos resilientes em ordem de tentativa para tolerância a picos de demanda (503 / high demand)
    const modelsToTry = [
      this.defaultModel,
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
    ].filter((m, i, arr) => arr.indexOf(m) === i);

    let lastError: unknown;

    for (const currentModel of modelsToTry) {
      try {
        logger.info(this.name, `Tentando geração com modelo: ${currentModel}`);
        const response = await this.client.models.generateContent({
          model: currentModel,
          contents: userPrompt,
          config: {
            systemInstruction: YMYL_FINANCE_SYSTEM_PROMPT,
            temperature: this.temperature,
            responseMimeType: 'application/json',
            responseJsonSchema: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: 'Título final e polido do artigo, atraente e otimizado para SEO.',
                },
                slug: {
                  type: Type.STRING,
                  description: 'Slug amigável para URL em letras minúsculas separadas por hífen.',
                },
                metaDescription: {
                  type: Type.STRING,
                  description: 'Meta description concisa e atrativa com 120 a 155 caracteres.',
                },
                content: {
                  type: Type.STRING,
                  description: 'Texto integral do artigo formatado em Markdown rico ou HTML semântico com H2, H3, listas e FAQ.',
                },
                keywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Lista de palavras-chave primárias e secundárias abordadas no artigo.',
                },
                readingTimeMinutes: {
                  type: Type.INTEGER,
                  description: 'Tempo estimado de leitura do artigo em minutos.',
                },
              },
              required: ['title', 'slug', 'metaDescription', 'content', 'keywords'],
              propertyOrdering: ['title', 'slug', 'metaDescription', 'content', 'keywords', 'readingTimeMinutes'],
            },
          },
        });

      const responseText = response.text;
      if (!responseText) {
        throw new AIProviderError('Resposta vazia recebida do Google Gemini.', {
          provider: this.name,
          statusCode: 502,
          isRetryable: true,
        });
      }

      let parsed: GeneratedArticle;
      try {
        parsed = JSON.parse(responseText) as GeneratedArticle;
      } catch (jsonErr) {
        throw new AIProviderError(
          `Falha ao converter resposta do modelo em JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
          {
            provider: this.name,
            statusCode: 500,
            isRetryable: false,
            originalError: jsonErr,
          }
        );
      }

      // Validação básica pós-parse
      if (!parsed.title || !parsed.content) {
        throw new AIProviderError('Campos obrigatórios (title, content) ausentes na resposta gerada.', {
          provider: this.name,
          statusCode: 502,
          isRetryable: true,
        });
      }

      logger.info(this.name, `Artigo gerado com sucesso: "${parsed.title}"`, {
        slug: parsed.slug,
        readingTime: parsed.readingTimeMinutes,
        contentLength: parsed.content.length,
      });

      return {
        title: parsed.title.trim(),
        slug: (parsed.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).trim(),
        metaDescription: parsed.metaDescription?.trim() || '',
        content: parsed.content.trim(),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : keywords,
        readingTimeMinutes: parsed.readingTimeMinutes || Math.ceil(parsed.content.split(/\s+/).length / 200),
      };
    } catch (err: unknown) {
      lastError = err;
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(this.name, `Falha com modelo ${currentModel}: ${errorMessage}. Tentando próximo modelo...`);
    }
  }

  // Se todos os modelos falharem
  const finalError = lastError;
  const finalMessage = finalError instanceof Error ? finalError.message : String(finalError);
  const isQuota = finalMessage.toLowerCase().includes('quota') || finalMessage.includes('429');
  const isHighDemand = finalMessage.includes('503') || finalMessage.toLowerCase().includes('high demand');

  throw new AIProviderError(
    isHighDemand
      ? 'A API do Gemini está temporariamente com alta demanda nos modelos testados. Por favor, tente novamente em alguns segundos.'
      : finalMessage,
    {
      provider: this.name,
      statusCode: isQuota ? 429 : isHighDemand ? 503 : 500,
      isRetryable: true,
      originalError: finalError,
    }
  );
}
}
