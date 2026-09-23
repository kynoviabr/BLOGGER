import { AIProvider } from './ai-provider.interface';
import { ImageProvider } from './image-provider.interface';
import { GeminiProvider } from './gemini-provider';
import { NanoBananaProvider } from './nano-banana-provider';
import { MockAIProvider, MockImageProvider } from './mock-ai-provider';
import { logger } from '@/lib/logger';

export interface AIFactoryOptions {
  geminiApiKey?: string;
  geminiModel?: string;
  geminiFallbackModel?: string;
  imageApiKey?: string;
  imageApiUrl?: string;
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
 */
export function createImageProvider(options: AIFactoryOptions = {}): ImageProvider {
  const apiKey = options.imageApiKey || process.env.IMAGE_API_KEY;
  const isMock = options.forceMock || process.env.IMAGE_PROVIDER_TYPE === 'mock' || !apiKey;

  if (isMock) {
    logger.info('AIFactory', 'Instanciando MockImageProvider (sem chave de API configurada ou mock forçado)');
    return new MockImageProvider();
  }

  return new NanoBananaProvider({
    apiKey,
    apiUrl: options.imageApiUrl,
  });
}
