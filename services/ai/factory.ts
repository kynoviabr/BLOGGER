import { AIProvider } from './ai-provider.interface';
import { ImageProvider } from './image-provider.interface';
import { GeminiProvider } from './gemini-provider';
import { OpenAIImageProvider } from './openai-image-provider';
import { TogetherImageProvider } from './together-image-provider';
import { PollinationsImageProvider } from './pollinations-image-provider';
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
  togetherApiKey?: string;
  togetherImageModel?: string;
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

  const rawProvider = (
    options.imageProvider ||
    process.env.IMAGE_PROVIDER ||
    (process.env.TOGETHER_API_KEY ? 'together' : process.env.OPENAI_API_KEY ? 'openai' : 'pollinations')
  ).toLowerCase().trim();

  // 1. Provedor Together AI (FLUX.1 e Nano Banana Serverless)
  if (rawProvider === 'together') {
    const togetherApiKey = options.togetherApiKey || process.env.TOGETHER_API_KEY;
    if (!togetherApiKey) {
      throw new ImageProviderError(
        'Configuração inválida: IMAGE_PROVIDER está configurado como "together", mas TOGETHER_API_KEY não foi informada.',
        { provider: 'TogetherImageProvider', statusCode: 401, isRetryable: false }
      );
    }
    logger.info('AIFactory', 'Instanciando TogetherImageProvider como motor oficial de imagem');
    return new TogetherImageProvider({
      apiKey: togetherApiKey,
      model: options.togetherImageModel || process.env.TOGETHER_IMAGE_MODEL,
    });
  }

  // 2. Provedor Pollinations (FLUX gratuito)
  if (rawProvider === 'pollinations') {
    logger.info('AIFactory', 'Instanciando PollinationsImageProvider');
    return new PollinationsImageProvider({
      model: process.env.POLLINATIONS_MODEL || 'flux',
    });
  }

  // 3. Provedor Nano Banana Dedicado
  if (rawProvider === 'nanobanana') {
    logger.info('AIFactory', 'Instanciando NanoBananaProvider explicitamente configurado');
    return new NanoBananaProvider({
      apiUrl: options.imageApiUrl,
      apiKey: options.imageApiKey,
    });
  }

  // 4. Provedor OpenAI (DALL-E)
  const openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    // Fallback gracioso para Pollinations caso nenhuma chave paga esteja configurada
    logger.warn('AIFactory', 'Nenhuma chave de imagem configurada. Utilizando PollinationsImageProvider como fallback seguro.');
    return new PollinationsImageProvider({
      model: process.env.POLLINATIONS_MODEL || 'flux',
    });
  }

  logger.info('AIFactory', 'Instanciando OpenAIImageProvider');
  return new OpenAIImageProvider({
    apiKey: openaiApiKey,
    model: options.openaiImageModel || process.env.OPENAI_IMAGE_MODEL,
    quality: options.openaiImageQuality || process.env.OPENAI_IMAGE_QUALITY,
    size: options.openaiImageSize || process.env.OPENAI_IMAGE_SIZE,
  });
}
