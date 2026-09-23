import {
  ImageProvider,
  GeneratedImage,
  ImageGenerationOptions,
} from './image-provider.interface';
import { ImageProviderError } from '@/lib/errors/ai.errors';
import { logger } from '@/lib/logger';

export interface PollinationsConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

export class PollinationsImageProvider implements ImageProvider {
  readonly name = 'PollinationsImageProvider';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: PollinationsConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://image.pollinations.ai/prompt';
    this.timeoutMs = config.timeoutMs || 60000; // 60 segundos
  }

  async generateFeaturedImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<GeneratedImage> {
    if (!prompt || prompt.trim().length === 0) {
      throw new ImageProviderError('O prompt para geração de imagem é obrigatório.', {
        provider: this.name,
        statusCode: 400,
        isRetryable: false,
      });
    }

    const cleanPrompt = prompt.trim();
    const width = options?.width || 1200;
    const height = options?.height || 630;
    const encodedPrompt = encodeURIComponent(cleanPrompt);
    const imageUrl = `${this.baseUrl}/${encodedPrompt}?width=${width}&height=${height}&nologo=true`;

    logger.info(this.name, 'Solicitando geração de imagem ao Pollinations.ai', {
      promptSnippet: cleanPrompt.slice(0, 80),
      width,
      height,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(imageUrl, {
        method: 'GET',
        headers: {
          Accept: 'image/jpeg,image/png,image/webp,*/*',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new ImageProviderError(
          `Falha na resposta do Pollinations.ai: status ${response.status} - ${errorText || response.statusText}`,
          {
            provider: this.name,
            statusCode: response.status,
            isRetryable: response.status >= 500 || response.status === 429,
          }
        );
      }

      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        throw new ImageProviderError('A API do Pollinations.ai retornou um buffer de imagem vazio.', {
          provider: this.name,
          statusCode: 502,
          isRetryable: true,
        });
      }

      logger.info(this.name, 'Imagem gerada com sucesso pelo Pollinations.ai', {
        mimeType,
        bufferBytes: buffer.length,
      });

      return {
        imageUrl,
        buffer,
        mimeType,
        altText: `Imagem de destaque ilustrativa para: ${cleanPrompt.slice(0, 80)}`,
        provider: this.name,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof ImageProviderError) {
        throw err;
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      const isTimeout =
        errorMessage.toLowerCase().includes('abort') ||
        errorMessage.toLowerCase().includes('timeout');

      logger.error(this.name, `Falha na chamada ao Pollinations.ai: ${errorMessage}`, {
        isTimeout,
        url: imageUrl,
      });

      throw new ImageProviderError(
        isTimeout
          ? `Tempo limite excedido (${this.timeoutMs}ms) ao gerar imagem com Pollinations.ai.`
          : `Falha ao gerar imagem com Pollinations.ai: ${errorMessage}`,
        {
          provider: this.name,
          statusCode: isTimeout ? 504 : 502,
          isRetryable: true,
          originalError: err,
        }
      );
    }
  }
}
