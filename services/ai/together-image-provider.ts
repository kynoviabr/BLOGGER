import {
  ImageProvider,
  GeneratedImage,
  ImageGenerationOptions,
} from "./image-provider.interface";
import { ImageProviderError } from "@/lib/errors/ai.errors";
import { logger } from "@/lib/logger";

export interface TogetherImageConfig {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

const TOGETHER_QUALITY_INSTRUCTIONS = `Editorial photography, cinematic lighting, 8k resolution.
Professional studio still life or real-world composition.
NEGATIVE CONSTRAINTS:
- No distorted faces, no extra fingers, no 6-fingered hands, no anatomical defects.
- No blurry, melted or unreadable text, no fake alien letters, no watermarks, no stock photo watermarks.
- No oversaturated cheap cartoon or plastic 3D render styles.`;

export class TogetherImageProvider implements ImageProvider {
  readonly name = "TogetherImageProvider";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: TogetherImageConfig = {}) {
    this.apiKey = config.apiKey || process.env.TOGETHER_API_KEY;
    this.model =
      config.model ||
      process.env.TOGETHER_IMAGE_MODEL ||
      "black-forest-labs/FLUX.1.1-pro";
    this.timeoutMs = config.timeoutMs || 45000;
    this.maxRetries = config.maxRetries ?? 2;
  }

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
      throw new ImageProviderError(
        "TOGETHER_API_KEY não foi configurada nas variáveis de ambiente.",
        {
          provider: this.name,
          statusCode: 401,
          isRetryable: false,
        }
      );
    }

    if (!prompt || !prompt.trim()) {
      throw new ImageProviderError("O prompt para geração de imagem é obrigatório.", {
        provider: this.name,
        statusCode: 400,
        isRetryable: false,
      });
    }

    const cleanPrompt = `${prompt.trim()}\n\n${TOGETHER_QUALITY_INSTRUCTIONS}`;
    const model = options?.model || this.model;

    // Resolução de dimensões garantindo estritamente múltiplos de 32 (exigência da API Together AI / FLUX)
    let width = 1216; // 38 * 32
    let height = 672; // 21 * 32 (proporção ~16:9 ideal para destaque de artigos no WordPress)

    if (options?.aspectRatio === "1:1") {
      width = 1024;
      height = 1024;
    } else if (options?.aspectRatio === "4:3") {
      width = 1152;
      height = 864;
    } else if (options?.aspectRatio === "9:16") {
      width = 672;
      height = 1216;
    }

    if (options?.width) {
      width = Math.max(256, Math.round(options.width / 32) * 32);
    }
    if (options?.height) {
      height = Math.max(256, Math.round(options.height / 32) * 32);
    }

    const totalAttempts = 1 + this.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      const attemptStartTime = Date.now();

      try {
        logger.info(this.name, `[Together AI] Tentativa ${attempt}/${totalAttempts} gerando imagem com modelo: ${model}`, {
          width,
          height,
          promptSnippet: cleanPrompt.slice(0, 80),
        });

        const isPro = model.includes("pro");
        const isSchnell = model.includes("schnell");

        const requestPayload: Record<string, unknown> = {
          model,
          prompt: cleanPrompt,
          width,
          height,
          n: 1,
        };

        // Modelos PRO (FLUX.1.1-pro) controlam steps internamente e rejeitam o parâmetro com 403
        if (!isPro) {
          requestPayload.steps = isSchnell ? 4 : 28;
          requestPayload.response_format = "b64_json";
        }

        const response = await fetch("https://api.together.xyz/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const durationMs = Date.now() - attemptStartTime;

        if (!response.ok) {
          const errorJson = await response.json().catch(() => ({}));
          const errMsg = errorJson.error?.message || errorJson.message || response.statusText;
          const isRetryable = this.isRetryableStatus(response.status);

          logger.warn(this.name, `Falha HTTP ${response.status} na Together AI (${durationMs}ms): ${errMsg}`);

          if (!isRetryable || attempt === totalAttempts) {
            throw new ImageProviderError(
              `Falha na geração de imagem com Together AI [${response.status}]: ${errMsg}`,
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
        const firstItem = data.data?.[0];

        if (!firstItem) {
          throw new ImageProviderError("Nenhuma imagem retornada na resposta da Together AI.", {
            provider: this.name,
            statusCode: 502,
            isRetryable: true,
          });
        }

        let buffer: Buffer | undefined;
        let imageUrl = "";

        if (firstItem.b64_json) {
          buffer = Buffer.from(firstItem.b64_json, "base64");
          imageUrl = `data:image/jpeg;base64,${firstItem.b64_json.slice(0, 32)}...`;
        } else if (firstItem.url) {
          imageUrl = firstItem.url;
          const imgFetch = await fetch(imageUrl);
          if (imgFetch.ok) {
            buffer = Buffer.from(await imgFetch.arrayBuffer());
          }
        }

        if (!buffer || buffer.length === 0) {
          throw new ImageProviderError("Buffer de imagem retornado pela Together AI está vazio.", {
            provider: this.name,
            statusCode: 502,
            isRetryable: true,
          });
        }

        logger.info(this.name, `[Together AI] Imagem gerada com sucesso (${buffer.length} bytes em ${durationMs}ms)`);

        return {
          imageUrl,
          buffer,
          mimeType: "image/jpeg",
          provider: this.name,
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof ImageProviderError) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === totalAttempts) {
          throw new ImageProviderError(
            `Erro fatal ao comunicar com Together AI após ${totalAttempts} tentativas: ${lastError.message}`,
            {
              provider: this.name,
              statusCode: 500,
              isRetryable: false,
              originalError: lastError,
            }
          );
        }
      }
    }

    throw new ImageProviderError("Falha desconhecida na geração de imagem com Together AI.", {
      provider: this.name,
      statusCode: 500,
      isRetryable: false,
    });
  }
}
