import { GoogleGenAI, Type } from '@google/genai';
import {
  AIProvider,
  GeneratedArticle,
  ArticleGenerationContext,
} from './ai-provider.interface';
import { AIProviderError } from '@/lib/errors/ai.errors';
import {
  YMYL_FINANCE_SYSTEM_PROMPT,
  buildYMYLFinanceSystemPrompt,
  buildYMYLFinanceUserPrompt,
} from '@/prompts/article-prompts';
import { logger } from '@/lib/logger';

export interface GeminiProviderConfig {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  temperature?: number;
  maxRetriesPerModel?: number;
}

interface GenerateParams {
  contents: string;
  systemInstruction?: string;
  temperature?: number;
  responseJsonSchema: unknown;
  overrideModel?: string;
  disableFallback?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
}

interface ClassifiedError {
  statusCode: number;
  isRetryable: boolean;
  userMessage: string;
  rawMessage: string;
}

export class GeminiProvider implements AIProvider {
  readonly name = 'GeminiProvider';
  readonly defaultModel: string;
  readonly fallbackModel: string;
  private readonly client: GoogleGenAI;
  private readonly temperature: number;
  private readonly maxRetriesPerModel: number;

  constructor(config: GeminiProviderConfig = {}) {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        'GEMINI_API_KEY não configurada nas variáveis de ambiente nem passada na inicialização.',
        { provider: this.name, statusCode: 401, isRetryable: false }
      );
    }

    this.defaultModel = config.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    this.fallbackModel = config.fallbackModel || process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash';
    this.temperature = config.temperature ?? 0.4;
    this.maxRetriesPerModel = config.maxRetriesPerModel ?? 2; // total de 3 tentativas por modelo
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Classifica rigorosamente os erros da API do Gemini e do SDK.
   */
  private classifyError(err: unknown, currentModel: string): ClassifiedError {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const lower = rawMessage.toLowerCase();

    // 1. Extração de status code
    let statusCode = 500;
    const statusProp = (err as { status?: number })?.status;
    if (typeof statusProp === 'number') {
      statusCode = statusProp;
    } else if (rawMessage.includes('"code":400') || lower.includes('invalid_argument')) {
      statusCode = 400;
    } else if (rawMessage.includes('"code":401') || rawMessage.includes('"code":403') || lower.includes('permission_denied')) {
      statusCode = 401;
    } else if (rawMessage.includes('"code":404') || lower.includes('not_found')) {
      statusCode = 404;
    } else if (rawMessage.includes('"code":429') || lower.includes('resource_exhausted')) {
      statusCode = 429;
    } else if (rawMessage.includes('"code":503') || lower.includes('unavailable')) {
      statusCode = 503;
    } else if (rawMessage.includes('"code":502')) {
      statusCode = 502;
    } else if (lower.includes('timeout') || lower.includes('abort') || lower.includes('deadline')) {
      statusCode = 504;
    }

    // 2. Classificação precisa por status e conteúdo do erro
    if (statusCode === 401 || statusCode === 403 || lower.includes('api key not valid') || lower.includes('api_key_invalid')) {
      return {
        statusCode: 401,
        isRetryable: false,
        userMessage: 'Falha na autenticação com o serviço Gemini. Verifique a configuração da API.',
        rawMessage,
      };
    }

    if (statusCode === 404 || lower.includes('is not found') || lower.includes('not available')) {
      return {
        statusCode: 404,
        isRetryable: false,
        userMessage: `O modelo Gemini configurado (${currentModel}) não está disponível. Verifique GEMINI_MODEL.`,
        rawMessage,
      };
    }

    if (statusCode === 400) {
      return {
        statusCode: 400,
        isRetryable: false,
        userMessage: 'Requisição inválida enviada à API do Gemini.',
        rawMessage,
      };
    }

    if (statusCode === 429 || lower.includes('quota') || lower.includes('rate_limit') || lower.includes('resource_exhausted')) {
      return {
        statusCode: 429,
        isRetryable: true,
        userMessage: 'Limite temporário da API Gemini atingido. Aguarde alguns instantes e tente novamente.',
        rawMessage,
      };
    }

    if (statusCode === 503 || lower.includes('high demand') || lower.includes('temporarily unavailable') || lower.includes('unavailable')) {
      return {
        statusCode: 503,
        isRetryable: true,
        userMessage: 'O serviço Gemini está temporariamente indisponível. Tente novamente em alguns instantes.',
        rawMessage,
      };
    }

    if (statusCode === 504 || lower.includes('timeout') || lower.includes('deadline') || lower.includes('fetch failed')) {
      return {
        statusCode: 504,
        isRetryable: true,
        userMessage: 'Tempo limite esgotado ao conectar com a API do Gemini. Tente novamente.',
        rawMessage,
      };
    }

    // Erros 500/502 ou falha desconhecida do servidor
    return {
      statusCode: statusCode >= 500 ? statusCode : 500,
      isRetryable: statusCode >= 500,
      userMessage: 'Falha temporária ao comunicar com a API do Gemini.',
      rawMessage,
    };
  }

  /**
   * Aguarda um período com exponential backoff e pequeno jitter.
   */
  private async delayWithBackoff(attempt: number): Promise<void> {
    const baseDelayMs = 1000;
    const backoffMs = baseDelayMs * Math.pow(2, attempt);
    const jitterMs = Math.floor(Math.random() * 300);
    const totalDelay = backoffMs + jitterMs;
    await new Promise((resolve) => setTimeout(resolve, totalDelay));
  }

  /**
   * Método centralizado e resiliente para chamadas à API do Gemini.
   * Gerencia retries com exponential backoff e fallback controlado entre modelos.
   */
  private async generateWithResilience<T>(
    operation: string,
    params: GenerateParams
  ): Promise<T> {
    const primaryModel = params.overrideModel || this.defaultModel;
    const modelsToExecute: string[] = [primaryModel];
    if (!params.disableFallback) {
      const alternateModel = primaryModel === this.defaultModel ? this.fallbackModel : this.defaultModel;
      if (alternateModel && alternateModel !== primaryModel && !modelsToExecute.includes(alternateModel)) {
        modelsToExecute.push(alternateModel);
      }
    }

    let lastError: ClassifiedError | null = null;
    const retriesLimit = params.maxRetries ?? this.maxRetriesPerModel;

    for (let modelIndex = 0; modelIndex < modelsToExecute.length; modelIndex++) {
      const currentModel = modelsToExecute[modelIndex];
      const isFallback = modelIndex > 0;

      if (isFallback) {
        logger.warn(
          this.name,
          `Primary model unavailable. Switching to fallback model: ${currentModel}`
        );
      }

      for (let attempt = 0; attempt <= retriesLimit; attempt++) {
        const attemptStartTime = Date.now();

        try {
          const timeoutMs = params.timeoutMs || (operation === 'generateIdea' ? 20000 : 45000);
          let timeoutHandle: NodeJS.Timeout | null = null;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error(`Timeout de ${timeoutMs}ms excedido aguardando resposta da API Gemini.`));
            }, timeoutMs);
          });

          const generatePromise = this.client.models.generateContent({
            model: currentModel,
            contents: params.contents,
            config: {
              systemInstruction: params.systemInstruction,
              temperature: params.temperature ?? this.temperature,
              responseMimeType: 'application/json',
              responseJsonSchema: params.responseJsonSchema as any,
            },
          });

          const response = await Promise.race([generatePromise, timeoutPromise]).finally(() => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
          });

          const durationMs = Date.now() - attemptStartTime;

          logger.info(this.name, `[GeminiProvider] operation=${operation} model=${currentModel} attempt=${attempt + 1} status=200 durationMs=${durationMs}`);

          const responseText = response.text;
          if (!responseText) {
            throw new AIProviderError('Resposta vazia recebida do Google Gemini.', {
              provider: this.name,
              statusCode: 502,
              isRetryable: true,
            });
          }

          let parsed: T;
          try {
            parsed = JSON.parse(responseText) as T;
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

          return parsed;
        } catch (err: unknown) {
          const durationMs = Date.now() - attemptStartTime;

          if (err instanceof AIProviderError && err.statusCode === 500 && !err.isRetryable) {
            // Erro fatal de parsing JSON não deve ser mascarado como alta demanda
            throw err;
          }

          const classified = this.classifyError(err, currentModel);
          lastError = classified;

          logger.warn(
            this.name,
            `[GeminiProvider] operation=${operation} model=${currentModel} attempt=${attempt + 1} status=${classified.statusCode} retryable=${classified.isRetryable} durationMs=${durationMs}`
          );

          // Se for erro não retryable (400, 401, 403, 404), falha imediatamente sem consumir mais retries
          if (!classified.isRetryable) {
            throw new AIProviderError(classified.userMessage, {
              provider: this.name,
              statusCode: classified.statusCode,
              isRetryable: false,
              originalError: err,
            });
          }

          // Se for retryable e ainda tiver tentativas para este modelo, aguarda o backoff
          if (attempt < this.maxRetriesPerModel) {
            await this.delayWithBackoff(attempt);
          }
        }
      }
    }

    // Se esgotou todas as tentativas e modelos disponíveis
    const finalStatusCode = lastError?.statusCode || 500;
    const finalUserMessage =
      lastError?.userMessage ||
      'Falha temporária ao comunicar com a API do Gemini após múltiplas tentativas.';

    throw new AIProviderError(finalUserMessage, {
      provider: this.name,
      statusCode: finalStatusCode,
      isRetryable: true,
      originalError: lastError?.rawMessage,
    });
  }

  async generateArticle(
    title: string,
    keywords: string[],
    context?: ArticleGenerationContext
  ): Promise<GeneratedArticle> {
    logger.info(this.name, `Iniciando geração de artigo: "${title}"`, {
      model: this.defaultModel,
      fallbackModel: this.fallbackModel,
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

    const parsed = await this.generateWithResilience<GeneratedArticle>('generateArticle', {
      contents: userPrompt,
      systemInstruction: buildYMYLFinanceSystemPrompt(context?.language),
      temperature: this.temperature,
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
          imagePrompt: {
            type: Type.STRING,
            description: 'Prompt altamente descritivo e artístico em inglês para a imagem de destaque. Traduza o tema em uma METÁFORA VISUAL escolhendo aleatoriamente 1 entre 5 estilos: 1) Fotografia Conceitual Minimalista (Still Life) com objetos físicos de estúdio; 2) Renderização Editorial 3D Isométrica; 3) Fotografia Arquitetônica e Urbana de grande escala; 4) Fotografia Macro Artística com texturas e iluminação dramática; 5) Ilustração Editorial Flat/Colagem (estilo The Economist). REGRA ABSOLUTA: É estritamente proibido descrever pessoas olhando para smartphones, telas, notebooks ou sentadas em mesas de escritório. Evite rostos humanos em close-up. Deve terminar obrigatoriamente com o sufixo: ", no screens, no laptops, no smartphones, no office desks".',
          },
        },
        required: ['title', 'slug', 'metaDescription', 'content', 'keywords', 'imagePrompt'],
        propertyOrdering: ['title', 'slug', 'metaDescription', 'content', 'keywords', 'readingTimeMinutes', 'imagePrompt'],
      },
    });

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
      hasImagePrompt: !!parsed.imagePrompt,
    });

    return {
      title: parsed.title.trim(),
      slug: (parsed.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).trim(),
      metaDescription: parsed.metaDescription?.trim() || '',
      content: parsed.content.trim(),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : keywords,
      readingTimeMinutes: parsed.readingTimeMinutes || Math.ceil(parsed.content.split(/\s+/).length / 200),
      imagePrompt: parsed.imagePrompt ? parsed.imagePrompt.trim() : undefined,
    };
  }

  async generateIdeas(context: {
    niche?: string;
    audience?: string;
    purpose?: string;
    category?: string;
    language?: string;
    count?: number;
  }): Promise<Array<{ title: string; keywords: string; description: string; type: string }>> {
    const count = Math.min(Math.max(context.count || 7, 5), 10);
    const niche = context.niche || 'Finanças Pessoais e Educação Financeira';
    const audience = context.audience || 'Pessoas que buscam organização financeira, cartões de crédito e sair das dívidas';
    const purpose = context.purpose || 'Informar, educar e gerar valor com alto nível de autoridade e clareza';
    const category = context.category ? `na categoria "${context.category}"` : 'em tópicos de alta demanda e relevância';
    const language = context.language || 'pt-BR';

    logger.info(this.name, `Gerando ${count} ideias de pautas para nicho: ${niche}, categoria: ${context.category || 'todas'}`);

    const prompt = `Você é um Estrategista de Conteúdo e Especialista em SEO Editorial.
Gere exatamente ${count} ideias inovadoras, atraentes e de alto potencial de tráfego orgânico ${category}.

Contexto do Blog:
- Nicho: ${niche}
- Público-Alvo: ${audience}
- Propósito/Linha Editorial: ${purpose}
- Idioma: ${language}

Cada ideia deve conter:
- title: Título proposto chamativo e otimizado para clique e SEO (até 65 caracteres).
- keywords: Lista de 3 a 5 palavras-chave estratégicas separadas por vírgulas.
- description: Notas detalhadas e orientações de estrutura/conteúdo para a IA escrever o artigo posteriormente.
- type: Tipo do artigo (ex: "Guia Completo", "Lista / Comparativo", "Passo a Passo", "Análise Crítica", "Dicas Práticas").`;

    const ideas = await this.generateWithResilience<Array<{ title: string; keywords: string; description: string; type: string }>>(
      'generateIdeas',
      {
        contents: prompt,
        temperature: 0.7,
        responseJsonSchema: {
          type: Type.ARRAY,
          description: 'Lista de ideias de pautas estruturadas para o blog',
          items: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: 'Título proposto para o artigo',
              },
              keywords: {
                type: Type.STRING,
                description: 'Palavras-chave separadas por vírgula',
              },
              description: {
                type: Type.STRING,
                description: 'Notas e instruções detalhadas para orientar a redação posterior',
              },
              type: {
                type: Type.STRING,
                description: 'Tipo ou formato do artigo (ex: Tutorial, Lista, Comparativo)',
              },
            },
            required: ['title', 'keywords', 'description', 'type'],
          },
        },
      }
    );

    if (!Array.isArray(ideas) || ideas.length === 0) {
      throw new AIProviderError('Nenhuma ideia retornada pela IA.', {
        provider: this.name,
        statusCode: 502,
        isRetryable: true,
      });
    }

    logger.info(this.name, `${ideas.length} ideias geradas com sucesso`);
    return ideas;
  }

  /**
   * Gera EXATAMENTE UMA ideia de pauta estruturada de forma rápida e com prevenção ativa de duplicidades.
   */
  async generateIdea(context: {
    niche?: string;
    audience?: string;
    purpose?: string;
    category?: string;
    availableCategories?: string[];
    language?: string;
    blogName?: string;
    existingIdeas?: Array<{ title: string; keywords?: string; type?: string }>;
    queuePosition?: number;
    totalRequested?: number;
  }): Promise<{ title: string; keywords: string; description: string; type: string; category?: string }> {
    const niche = context.niche || 'Finanças Pessoais e Educação Financeira';
    const audience = context.audience || 'Pessoas que buscam organização financeira, cartões de crédito e sair das dívidas';
    const purpose = context.purpose || 'Informar, educar e gerar valor com alto nível de autoridade e clareza';
    const language = context.language || 'pt-BR';
    const blogName = context.blogName ? `do blog "${context.blogName}"` : '';
    const pos = context.queuePosition ? ` (Pauta ${context.queuePosition} de ${context.totalRequested || 'N'})` : '';

    let categoryInstruction = '';
    if (context.category) {
      categoryInstruction = `na categoria "${context.category}"`;
    } else if (context.availableCategories && context.availableCategories.length > 0) {
      categoryInstruction = `em uma das seguintes categorias do blog: ${context.availableCategories.join(', ')}`;
    } else {
      categoryInstruction = 'em tópicos de alta demanda e relevância editorial';
    }

    let existingBlock = '';
    if (context.existingIdeas && context.existingIdeas.length > 0) {
      const list = context.existingIdeas
        .slice(-20) // últimas 20 para diversidade robusta
        .map((item, idx) => `${idx + 1}. "${item.title}" [Palavras-chave: ${item.keywords || 'N/A'}] (Tipo: ${item.type || 'N/A'})`)
        .join('\n');
      existingBlock = `\nPAUTAS JÁ EXISTENTES / GERADAS NESTA SESSÃO (NÃO REPETIR OU VARIAR SUTILMENTE ESTES TEMAS):\n${list}\n`;
    }

    const ideasModel = process.env.GEMINI_IDEAS_MODEL || 'gemini-3.5-flash';

    logger.info(this.name, `Gerando 1 pauta unitária${pos} para blog: ${blogName || niche} usando modelo ${ideasModel}`);

    const prompt = `Você é um Estrategista de Conteúdo e Especialista em SEO Editorial.
Crie EXATAMENTE UMA ideia inovadora, atraente e de alto potencial de tráfego orgânico ${categoryInstruction} para o blog ${blogName}.

Contexto Editorial:
- Nicho: ${niche}
- Público-Alvo: ${audience}
- Propósito/Linha Editorial: ${purpose}
- Idioma: ${language}
${existingBlock}
INSTRUÇÕES CRÍTICAS DE DIVERSIDADE E FORMATO:
- Crie exatamente UMA nova pauta.
- Ela deve ser SUBSTANCIALMENTE DIFERENTE das pautas já existentes listadas acima.
- NÃO reutilize o mesmo assunto principal, intenção de busca ou ângulo editorial.
- Forneça:
  - title: Título proposto atraente, conciso e otimizado para CTR e SEO (até 65 caracteres).
  - keywords: 3 a 5 palavras-chave estratégicas separadas por vírgulas.
  - description: Resumo objetivo de 2 a 3 frases com o ângulo e pontos-chave a abordar no artigo.
  - type: Tipo do artigo (ex: "Guia Completo", "Lista Comparativa", "Passo a Passo", "Análise Prática").
  - category: Categoria correspondente da pauta (escolha dentre as categorias do blog informadas ou use a categoria indicada).
- Retorne EXATAMENTE UM objeto JSON correspondente a esta única pauta.`;

    const idea = await this.generateWithResilience<{ title: string; keywords: string; description: string; type: string; category?: string }>(
      'generateIdea',
      {
        contents: prompt,
        temperature: 0.7,
        overrideModel: ideasModel,
        disableFallback: true,
        maxRetries: 1,
        timeoutMs: 20000,
        responseJsonSchema: {
          type: Type.OBJECT,
          description: 'Uma única ideia de pauta estruturada para o blog',
          properties: {
            title: {
              type: Type.STRING,
              description: 'Título proposto para o artigo (até 65 caracteres)',
            },
            keywords: {
              type: Type.STRING,
              description: 'Palavras-chave separadas por vírgula',
            },
            description: {
              type: Type.STRING,
              description: 'Resumo objetivo e instruções para o artigo',
            },
            type: {
              type: Type.STRING,
              description: 'Tipo ou formato do artigo (ex: Guia Completo, Passo a Passo)',
            },
            category: {
              type: Type.STRING,
              description: 'Nome da categoria correspondente',
            },
          },
          required: ['title', 'keywords', 'description', 'type'],
        },
      }
    );

    if (!idea || !idea.title) {
      throw new AIProviderError('Resposta inválida: nenhuma ideia gerada.', {
        provider: this.name,
        statusCode: 502,
        isRetryable: true,
      });
    }

    return {
      title: idea.title.trim(),
      keywords: idea.keywords.trim(),
      description: idea.description.trim(),
      type: idea.type.trim(),
      category: idea.category?.trim() || context.category,
    };
  }
}
