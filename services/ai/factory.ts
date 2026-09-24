import { AIProvider } from './ai-provider.interface';
import { ImageProvider } from './image-provider.interface';
import { GeminiProvider } from './gemini-provider';
import { PollinationsImageProvider } from './pollinations-image-provider';
import { OpenAIImageProvider } from './openai-image-provider';
import { FallbackImageProvider } from './fallback-image-provider';
import { NanoBananaProvider } from './nano-banana-provider';
import { MockAIProvider, MockImageProvider } from './mock-ai-provider';
import { ImageProviderError } from '@/lib/errors/ai.errors';
import { logger } from '@/lib/logger';

export interface AIFactoryOptions {
  geminiApiKey?: string;
  geminiModel?: string;
  geminiFallbackModel?: string;
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
 * Seleciona GeminiProvider se a chave estiver presente, ou MockAIProvider como fallback de desenvolvimento/testes.
 */
export function createAIProvider(options: AIFactoryOptions = {}): AIProvider {
  const apiKey = options.geminiApiKey || process.env.GEMINI_API_KEY;
  const isMock = options.forceMock || process.env.AI_PROVIDER_TYPE === 'mock' || !apiKey;

  if (isMock) {
    logger.info('AIFactory', 'Instanciando MockAIProvider (sem chave de API configurada ou mock forçado)');
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
