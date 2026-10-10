import crypto from 'crypto';
import {
  ImageProvider,
  GeneratedImage,
  ImageGenerationOptions,
} from './image-provider.interface';
import { ImageProviderError } from '@/lib/errors/ai.errors';
import { logger } from '@/lib/logger';

export interface PollinationsConfig {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class PollinationsImageProvider implements ImageProvider {
  readonly name = 'PollinationsImageProvider';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: PollinationsConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://image.pollinations.ai/prompt';
    this.model = config.model || process.env.POLLINATIONS_MODEL || 'flux';
    this.timeoutMs = config.timeoutMs || 30000; // 30 segundos conforme requisito
    this.maxRetries = config.maxRetries ?? 2; // total de 3 tentativas
  }

  /**
   * Detecta o formato MIME real da imagem através de magic bytes.
   * Retorna null caso o buffer não corresponda a uma imagem válida (ex: HTML de erro, JSON ou payload truncado).
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
   * Determina se o erro retornado pela chamada HTTP é transitório e elegível a retry.
   */
  private isRetryableStatus(status: number): boolean {
    // 429 (Rate Limit) ou 5xx (erros transitórios do servidor/gateway)
    return status === 429 || (status >= 500 && status <= 504);
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
    const height = options?.height || 675; // Proporção 16:9 padrão

    // Gera uma seed aleatória a cada chamada
    const seed = options?.seed ?? Math.floor(Math.random() * 10000000);

    const encodedPrompt = encodeURIComponent(cleanPrompt);
    const imageUrl = `${this.baseUrl}/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true`;

    logger.info(this.name, 'Iniciando solicitação de geração de imagem ao Pollinations.ai', {
      promptSnippet: cleanPrompt.slice(0, 80),
      model: 'flux',
      width,
      height,
      seed,
    });

    const totalAttempts = 1 + this.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      const attemptStartTime = Date.now();

      try {
        const response = await fetch(imageUrl, {
          method: 'GET',
          headers: {
            Accept: 'image/jpeg,image/png,image/webp,*/*',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const durationMs = Date.now() - attemptStartTime;

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          const isRetryable = this.isRetryableStatus(response.status);

          logger.warn(
            this.name,
            `Tentativa ${attempt}/${totalAttempts} falhou com status HTTP ${response.status} (${durationMs}ms): ${errorText.slice(0, 150)}`
          );

          if (!isRetryable || attempt === totalAttempts) {
            throw new ImageProviderError(
              `Falha na resposta do Pollinations.ai: status ${response.status} - ${errorText || response.statusText}`,
              {
                provider: this.name,
                statusCode: response.status,
                isRetryable,
              }
            );
          }

          // Backoff exponencial para erros transitórios
          const backoffDelay = 1500 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          continue;
        }

        const headerContentType = response.headers.get('content-type') || '';
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length === 0) {
          throw new ImageProviderError('A API do Pollinations.ai retornou um buffer de imagem vazio.', {
            provider: this.name,
            statusCode: 502,
            isRetryable: true,
          });
        }

        // Validação estrita por magic bytes (garante que não é HTML ou JSON de erro mascarado com 200)
        const detectedMime = this.detectImageMimeType(buffer);
        if (!detectedMime) {
          const snippet = buffer.subarray(0, 100).toString('utf8');
          logger.warn(
            this.name,
            `Tentativa ${attempt}/${totalAttempts}: resposta recebida não contém assinatura binária de imagem válida (header: ${headerContentType}, snippet: ${snippet.slice(0, 50)})`
          );

          if (attempt === totalAttempts) {
            throw new ImageProviderError(
              'A resposta recebida do Pollinations.ai não é um formato de imagem suportado (JPEG/PNG/WEBP).',
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

        logger.info(this.name, 'Imagem gerada e validada com sucesso pelo Pollinations.ai', {
          mimeType: detectedMime,
          bufferBytes: buffer.length,
          durationMs,
          attempt,
        });

        return {
          imageUrl,
          buffer,
          mimeType: detectedMime,
          altText: `Imagem de destaque ilustrativa para: ${cleanPrompt.slice(0, 80)}`,
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
            : new ImageProviderError(`Erro na chamada ao Pollinations: ${errorMessage}`, {
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

    throw lastError || new ImageProviderError('Falha desconhecida ao gerar imagem com Pollinations.ai.', {
      provider: this.name,
      statusCode: 502,
      isRetryable: true,
    });
  }
}
