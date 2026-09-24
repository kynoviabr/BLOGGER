import {
  ImageProvider,
  GeneratedImage,
  ImageGenerationOptions,
} from './image-provider.interface';
import { logger } from '@/lib/logger';

export class FallbackImageProvider implements ImageProvider {
  readonly name: string;
  readonly primary: ImageProvider;
  readonly fallback: ImageProvider;

  constructor(primary: ImageProvider, fallback: ImageProvider) {
    this.primary = primary;
    this.fallback = fallback;
    this.name = `${primary.name}WithFallback`;
  }

  async generateFeaturedImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<GeneratedImage> {
    try {
      return await this.primary.generateFeaturedImage(prompt, options);
    } catch (primaryError) {
      const primaryErrorMessage =
        primaryError instanceof Error ? primaryError.message : String(primaryError);

      logger.warn('ImageProvider', 'primary provider failed', {
        primaryProvider: this.primary.name,
        error: primaryErrorMessage,
      });

      logger.info('ImageProvider', 'fallback activated', {
        fallbackProvider: this.fallback.name,
      });

      try {
        const fallbackResult = await this.fallback.generateFeaturedImage(prompt, options);

        logger.info('ImageProvider', 'fallback result', {
          provider: fallbackResult.provider,
          success: true,
        });

        return fallbackResult;
      } catch (fallbackError) {
        const fallbackErrorMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

        logger.error('ImageProvider', 'fallback result', {
          fallbackProvider: this.fallback.name,
          success: false,
          error: fallbackErrorMessage,
        });

        throw fallbackError;
      }
    }
  }
}
