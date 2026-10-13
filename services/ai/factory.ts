import { AIProvider } from './ai-provider.interface';
import { ImageProvider } from './image-provider.interface';
import { GeminiProvider } from './gemini-provider';
import { OpenAIImageProvider } from './openai-image-provider';
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
 * Provedor oficial: OpenAI (OpenAIImageProvider).
 * Sem fallback para Pollinations; qualquer erro é registrado no log de erro.
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

  if (rawProvider && rawProvider.toLowerCase().trim() === 'nanobanana') {
    logger.info('AIFactory', 'Instanciando NanoBananaProvider explicitamente configurado');
    return new NanoBananaProvider({
      apiUrl: options.imageApiUrl,
      apiKey: options.imageApiKey,
    });
  }

  if (!openaiApiKey) {
    throw new ImageProviderError(
      'Configuração inválida: OPENAI_API_KEY não foi informada para geração de imagens.',
      {
        provider: 'OpenAIImageProvider',
        statusCode: 401,
        isRetryable: false,
      }
    );
  }

  logger.info('AIFactory', 'Instanciando OpenAIImageProvider (exclusivo, sem fallback Pollinations)');
  return new OpenAIImageProvider({
    apiKey: openaiApiKey,
    model: options.openaiImageModel || process.env.OPENAI_IMAGE_MODEL,
    quality: options.openaiImageQuality || process.env.OPENAI_IMAGE_QUALITY,
    size: options.openaiImageSize || process.env.OPENAI_IMAGE_SIZE,
  });
}
