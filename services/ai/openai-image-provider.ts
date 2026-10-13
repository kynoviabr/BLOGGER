import {
  ImageProvider,
  GeneratedImage,
  ImageGenerationOptions,
} from './image-provider.interface';
import { ImageProviderError } from '@/lib/errors/ai.errors';
import { ImageOptimizer } from '@/lib/image-optimizer';
import { logger } from '@/lib/logger';

export interface OpenAIImageConfig {
  apiKey?: string;
  model?: string;
  quality?: string;
  size?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

const GLOBAL_QUALITY_INSTRUCTIONS = `High-end editorial publication standards.
Metaphorical, conceptual, and sophisticated visual direction.
STRICT NEGATIVE CONSTRAINTS:
- ABSOLUTELY NO people sitting at office desks or looking at computer screens, laptops, tablets, or smartphones.
- NO people holding credit cards, bills, calculators, or paper invoices towards the camera.
- NO cheesy corporate stock photos or clichés.
- NO readable text, no letters, no numbers, no logos, no brand names, no watermarks.
- Focus on conceptual still life, modern architectural perspectives, macro textures, or 3D isometric metaphors.
- Landscape composition (16:9), cinematic natural or dramatic studio lighting, 8k resolution.`;

export class OpenAIImageProvider implements ImageProvider {
  readonly name = 'OpenAIImageProvider';
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly quality: string;
  private readonly size: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: OpenAIImageConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.model = config.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini';
    this.quality = config.quality || process.env.OPENAI_IMAGE_QUALITY || 'medium';
    this.size = config.size || process.env.OPENAI_IMAGE_SIZE || '1536x1024';
    this.timeoutMs = config.timeoutMs ?? 60000; // 60 segundos conforme requisito
    this.maxRetries = config.maxRetries ?? 2; // total de 3 tentativas
  }

  /**
   * Detecta o formato MIME real da imagem através de magic bytes.
   * Retorna null caso o buffer não corresponda a uma imagem válida.
   */
  private detectImageMimeType(buffer: Buffer): string | null {
    if (!buffer || buffer.length < 12) return null;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0D &&
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A &&
      buffer[7] === 0x0A
    ) {
      return 'image/png';
    }

    // WEBP: RIFF .... WEBP
    if (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }

    return null;
  }

  /**
   * Determina se o status HTTP retornado é passível de retry (transitório).
   * Erros 400, 401 e 403 NÃO devem ser repetidos automaticamente.
   */
  private isRetryableStatus(status: number): boolean {
    if (status === 400 || status === 401 || status === 403) {
      return false;
    }
    return status === 429 || (status >= 500 && status <= 504);
  }

  async generateFeaturedImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<GeneratedImage> {
    if (!this.apiKey) {
      throw new ImageProviderError('OPENAI_API_KEY não foi configurada no ambiente.', {
        provider: this.name,
        statusCode: 401,
        isRetryable: false,
      });
    }

    if (!prompt || prompt.trim().length === 0) {
      throw new ImageProviderError('O prompt para geração de imagem é obrigatório.', {
        provider: this.name,
        statusCode: 400,
        isRetryable: false,
      });
    }

    const cleanPrompt = prompt.trim();
    const finalPrompt = `${cleanPrompt}\n\n${GLOBAL_QUALITY_INSTRUCTIONS}`;
    const model = options?.model || this.model;
    const quality = this.quality;
    const size = this.size;

    logger.info(this.name, 'generating image', {
      promptSnippet: cleanPrompt.slice(0, 80),
    });
    logger.info(this.name, 'model', { model });
    logger.info(this.name, 'quality', { quality });
    logger.info(this.name, 'size', { size });

    const totalAttempts = 1 + this.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      const attemptStartTime = Date.now();

      try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            prompt: finalPrompt,
            quality,
            size,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const durationMs = Date.now() - attemptStartTime;

        if (!response.ok) {
          const errorJson = await response.json().catch(() => ({}));
          const errorMessage =
            (errorJson as { error?: { message?: string } })?.error?.message ||
            response.statusText;
          const isRetryable = this.isRetryableStatus(response.status);

          logger.warn(
            this.name,
            `Tentativa ${attempt}/${totalAttempts} falhou com status HTTP ${response.status} (${durationMs}ms): ${errorMessage}`
          );

          if (!isRetryable || attempt === totalAttempts) {
            throw new ImageProviderError(
              `Falha na resposta da OpenAI Images API: status ${response.status} - ${errorMessage}`,
              {
                provider: this.name,
                statusCode: response.status,
                isRetryable,
                originalError: errorJson,
              }
            );
          }

          const backoffDelay = 1500 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          continue;
        }

        const data = await response.json();
        const imageItem = data?.data?.[0];

        let rawBuffer: Buffer | null = null;
        let directUrl = '';

        if (imageItem?.b64_json) {
          rawBuffer = Buffer.from(imageItem.b64_json, 'base64');
          directUrl = imageItem.url || '';
        } else if (imageItem?.url) {
          directUrl = imageItem.url;
          const imgResponse = await fetch(imageItem.url);
          if (imgResponse.ok) {
            rawBuffer = Buffer.from(await imgResponse.arrayBuffer());
          }
        }

        if (!rawBuffer || rawBuffer.length === 0) {
          throw new ImageProviderError('A OpenAI retornou payload sem buffer de imagem válido.', {
            provider: this.name,
            statusCode: 502,
            isRetryable: true,
          });
        }

        // Validação estrita por magic bytes
        const detectedMime = this.detectImageMimeType(rawBuffer);
        if (!detectedMime) {
          logger.warn(
            this.name,
            `Tentativa ${attempt}/${totalAttempts}: resposta recebida não contém assinatura binária de imagem suportada.`
          );

          if (attempt === totalAttempts) {
            throw new ImageProviderError(
              'A resposta recebida da OpenAI não é um formato de imagem suportado (PNG/JPEG/WEBP).',
              {
                provider: this.name,
                statusCode: 502,
                isRetryable: false,
              }
            );
          }

          const backoffDelay = 1500 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          continue;
        }

        logger.info(this.name, 'generation completed', {
          originalMime: detectedMime,
          originalBytes: rawBuffer.length,
          durationMs,
          attempt,
        });

        // Otimização para JPEG (preserva buffer original caso falhe)
        const optimized = await ImageOptimizer.optimize(rawBuffer, detectedMime, {
          format: 'jpeg',
          quality: 85,
        });

        return {
          imageUrl: directUrl,
          buffer: optimized.buffer,
          mimeType: optimized.mimeType,
          altText: `Imagem de destaque editorial para: ${cleanPrompt.slice(0, 80)}`,
          provider: this.name,
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        if (err instanceof ImageProviderError && !err.isRetryable) {
          throw err;
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        const isTimeout =
          errorMessage.toLowerCase().includes('abort') ||
          errorMessage.toLowerCase().includes('timeout');

        const durationMs = Date.now() - attemptStartTime;
        logger.warn(
          this.name,
          `Erro na tentativa ${attempt}/${totalAttempts} (${durationMs}ms): ${errorMessage}`
        );

        lastError =
          err instanceof Error
            ? err
            : new ImageProviderError(`Erro na chamada à OpenAI: ${errorMessage}`, {
                provider: this.name,
                statusCode: isTimeout ? 504 : 502,
                isRetryable: true,
              });

        if (attempt < totalAttempts) {
          const backoffDelay = 1500 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        }
      }
    }

    const finalError =
      lastError ||
      new ImageProviderError('Falha ao gerar imagem com OpenAI.', {
        provider: this.name,
        statusCode: 502,
        isRetryable: false,
      });

    logger.error(this.name, `Falha definitiva ao gerar imagem com OpenAI após ${totalAttempts} tentativa(s): ${finalError.message}`, {
      error: finalError,
      model: this.model,
      quality: this.quality,
      size: this.size,
      prompt: cleanPrompt.slice(0, 150),
    });

    throw finalError;
  }
}
