import {
  ImageProvider,
  GeneratedImage,
  ImageGenerationOptions,
} from './image-provider.interface';
import { ImageProviderError } from '@/lib/errors/ai.errors';
import { logger } from '@/lib/logger';

export interface NanoBananaConfig {
  apiUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class NanoBananaProvider implements ImageProvider {
  readonly name = 'NanoBananaProvider';
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: NanoBananaConfig = {}) {
    this.apiUrl =
      config.apiUrl ||
      process.env.IMAGE_API_URL ||
      'https://api.nanobanana.ai/v1/generate';
    this.apiKey = config.apiKey || process.env.IMAGE_API_KEY || '';
    this.timeoutMs = config.timeoutMs || 45000;

    if (!this.apiKey) {
      throw new ImageProviderError(
        'IMAGE_API_KEY não configurada nas variáveis de ambiente nem passada na inicialização.',
        { provider: this.name, statusCode: 401, isRetryable: false }
      );
    }
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

    logger.info(this.name, `Solicitando geração de imagem de destaque`, {
      promptSnippet: prompt.slice(0, 60),
      aspectRatio: options?.aspectRatio || '16:9',
      style: options?.style || 'photorealistic-editorial',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspect_ratio: options?.aspectRatio || '16:9',
          style: options?.style || 'editorial',
          negative_prompt:
            options?.negativePrompt ||
            'low quality, blur, watermark, distorted, unrealistic proportions, text artefacts',
          width: options?.width || 1200,
          height: options?.height || 675,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const isRetryable = response.status >= 500 || response.status === 429;

        throw new ImageProviderError(
          `Falha na API NanoBanana: status ${response.status} - ${errorBody || response.statusText}`,
          {
            provider: this.name,
            statusCode: response.status,
            isRetryable,
          }
        );
      }

      const data = await response.json();

      // Suporta respostas comuns de provedores REST (data[0].url ou url direta ou image_url ou base64)
      const imageUrl =
        data.imageUrl ||
        data.image_url ||
        data.url ||
        (Array.isArray(data.data) && data.data[0]?.url) ||
        (Array.isArray(data.images) && data.images[0]?.url);

      const base64Data =
        data.base64 ||
        data.b64_json ||
        (Array.isArray(data.data) && data.data[0]?.b64_json);

      if (!imageUrl && !base64Data) {
        throw new ImageProviderError(
          'A resposta da API de imagem não conteve nem uma URL pública nem dados em base64.',
          { provider: this.name, statusCode: 502, isRetryable: true }
        );
      }

      logger.info(this.name, 'Imagem gerada com sucesso pela NanoBanana', {
        hasUrl: !!imageUrl,
        hasBase64: !!base64Data,
      });

      return {
        imageUrl: imageUrl || '',
        base64: base64Data,
        mimeType: 'image/webp',
        altText: `Imagem de destaque ilustrativa para: ${prompt.slice(0, 80)}`,
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

      logger.error(this.name, `Erro na chamada NanoBanana: ${errorMessage}`, { error: err });

      throw new ImageProviderError(
        isTimeout ? `Timeout ao gerar imagem após ${this.timeoutMs}ms.` : errorMessage,
        {
          provider: this.name,
          statusCode: isTimeout ? 504 : 500,
          isRetryable: isTimeout,
          originalError: err,
        }
      );
    }
  }
}
