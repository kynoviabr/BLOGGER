import { AIProvider } from './ai-provider.interface';
import { ImageProvider } from './image-provider.interface';
import { GeminiProvider } from './gemini-provider';
import { PollinationsImageProvider } from './pollinations-image-provider';
import { OpenAIImageProvider } from './openai-image-provider';
import { FallbackImageProvider } from './fallback-image-provider';
import { NanoBananaProvider } from './nano-banana-provider';
import { MockAIProvider, MockImageProvider } from './mock-ai-provider';
import { DeepSeekProvider } from './deepseek-provider';
import { AIProviderError, ImageProviderError } from '@/lib/errors/ai.errors';
import { logger } from '@/lib/logger';

export interface AIFactoryOptions {
  textProvider?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiFallbackModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  deepseekBaseUrl?: string;
  imageApiKey?: string;
  imageApiUrl?: string;
  imageProvider?: string;
  openaiApiKey?: string;
  openaiImageModel?: string;
  openaiImageQuality?: string;
  openaiImageSize?: string;
  forceMock?: boolean;
}

/**
 * Factory para criação do provedor de geração de texto/artigos.
 * Suporta DeepSeekProvider (padrão principal de produção) e GeminiProvider (alternativo),
 * ou MockAIProvider como fallback de testes.
 */
export function createAIProvider(options: AIFactoryOptions = {}): AIProvider {
  const isMock = options.forceMock || process.env.AI_PROVIDER_TYPE === 'mock';
  if (isMock) {
    logger.info('AIFactory', 'Instanciando MockAIProvider (mock forçado)');
    return new MockAIProvider();
  }

  const textProvider = (
    options.textProvider ||
    process.env.TEXT_PROVIDER ||
    process.env.AI_PROVIDER ||
    'deepseek'
  ).toLowerCase().trim();

  if (textProvider === 'gemini') {
    const apiKey = options.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.info('AIFactory', 'Instanciando MockAIProvider (sem chave GEMINI_API_KEY configurada)');
      return new MockAIProvider();
    }

    return new GeminiProvider({
      apiKey,
      model: options.geminiModel,
      fallbackModel: options.geminiFallbackModel,
    });
  }

  if (textProvider === 'deepseek' || process.env.AI_PROVIDER_TYPE === 'deepseek') {
    const apiKey = options.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        'Configuração inválida: AI_PROVIDER está configurado como "deepseek", mas DEEPSEEK_API_KEY não foi informada.',
        { provider: 'DeepSeekProvider', statusCode: 401, isRetryable: false }
      );
    }
    logger.info('AIFactory', 'Instanciando DeepSeekProvider como motor de texto editorial');
    return new DeepSeekProvider({
      apiKey,
      model: options.deepseekModel || process.env.DEEPSEEK_MODEL,
      baseUrl: options.deepseekBaseUrl || process.env.DEEPSEEK_BASE_URL,
    });
  }

  const apiKey = options.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.info('AIFactory', 'Instanciando MockAIProvider (sem chave configurada)');
    return new MockAIProvider();
  }

  return new GeminiProvider({
    apiKey,
    model: options.geminiModel,
    fallbackModel: options.geminiFallbackModel,
  });
}

/**
 * Factory para criação do provedor de geração de imagens.
 * Suporta IMAGE_PROVIDER=openai e IMAGE_PROVIDER=pollinations.
 * Para openai, instancia OpenAIImageProvider com FallbackImageProvider (Pollinations) automático.
 * A existência de IMAGE_API_KEY NÃO afeta a seleção automática do provider.
 */
export function createImageProvider(options: AIFactoryOptions = {}): ImageProvider {
  const isMock =
    options.forceMock ||
    process.env.IMAGE_PROVIDER_TYPE === 'mock' ||
    process.env.IMAGE_PROVIDER === 'mock';

  if (isMock) {
    logger.info('AIFactory', 'Instanciando MockImageProvider (mock forçado)');
    return new MockImageProvider();
  }

  const rawProvider = options.imageProvider || process.env.IMAGE_PROVIDER;
  const openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;

  let selectedProvider: string;
  if (rawProvider) {
    selectedProvider = rawProvider.toLowerCase().trim();
  } else if (openaiApiKey) {
    selectedProvider = 'openai';
  } else {
    selectedProvider = 'pollinations';
    logger.info(
      'AIFactory',
      'OPENAI_API_KEY não encontrada e IMAGE_PROVIDER não especificado. Utilizando PollinationsImageProvider como padrão seguro.'
    );
  }

  if (selectedProvider === 'nanobanana') {
    logger.info('AIFactory', 'Instanciando NanoBananaProvider explicitamente configurado');
    return new NanoBananaProvider({
      apiUrl: options.imageApiUrl,
      apiKey: options.imageApiKey,
    });
  }

  if (selectedProvider === 'pollinations') {
    logger.info('AIFactory', 'Instanciando PollinationsImageProvider explicitamente configurado');
    return new PollinationsImageProvider({
      baseUrl: options.imageApiUrl,
    });
  }

  if (selectedProvider === 'openai') {
    if (!openaiApiKey) {
      throw new ImageProviderError(
        'Configuração inválida: IMAGE_PROVIDER está configurado como "openai", mas OPENAI_API_KEY não foi informada.',
        {
          provider: 'OpenAIImageProvider',
          statusCode: 401,
          isRetryable: false,
        }
      );
    }

    logger.info('AIFactory', 'Instanciando OpenAIImageProvider com Fallback para PollinationsImageProvider');
    const primary = new OpenAIImageProvider({
      apiKey: openaiApiKey,
      model: options.openaiImageModel || process.env.OPENAI_IMAGE_MODEL,
      quality: options.openaiImageQuality || process.env.OPENAI_IMAGE_QUALITY,
      size: options.openaiImageSize || process.env.OPENAI_IMAGE_SIZE,
    });

    const fallback = new PollinationsImageProvider({
      baseUrl: options.imageApiUrl,
    });

    return new FallbackImageProvider(primary, fallback);
  }

  throw new ImageProviderError(
    `Provedor de imagem desconhecido ou não suportado: "${selectedProvider}". Use "openai" ou "pollinations".`,
    {
      provider: 'AIFactory',
      statusCode: 400,
      isRetryable: false,
    }
  );
}
