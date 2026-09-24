import { logger } from '@/lib/logger';

export interface OptimizeImageOptions {
  format?: 'jpeg' | 'webp' | 'png';
  quality?: number;
}

export interface OptimizedImageResult {
  buffer: Buffer;
  mimeType: string;
  originalBytes: number;
  optimizedBytes: number;
  reductionPercentage: number;
}

export class ImageOptimizer {
  /**
   * Otimiza um buffer de imagem convertendo para JPEG (ou formato configurado).
   * Utiliza qualidade 85 e mozjpeg para máxima compatibilidade com WordPress/servidores web.
   * Mantém as dimensões originais sem upscale e registra métricas de compressão.
   * Em caso de falha no processador ou indisponibilidade da biblioteca nativa,
   * retorna de forma segura o buffer e mimeType originais como fallback.
   */
  static async optimize(
    inputBuffer: Buffer,
    inputMimeType: string,
    options: OptimizeImageOptions = {}
  ): Promise<OptimizedImageResult> {
    const quality = options.quality ?? 85;
    const format = options.format ?? 'jpeg';
    const originalBytes = inputBuffer.length;

    try {
      const sharpModule = await import('sharp');
      const sharp = sharpModule.default || sharpModule;

      let pipeline = sharp(inputBuffer);
      let outputMime = 'image/jpeg';

      if (format === 'jpeg') {
        try {
          pipeline = pipeline.jpeg({ quality, mozjpeg: true });
        } catch {
          pipeline = pipeline.jpeg({ quality });
        }
        outputMime = 'image/jpeg';
      } else if (format === 'webp') {
        pipeline = pipeline.webp({ quality, effort: 4 });
        outputMime = 'image/webp';
      } else if (format === 'png') {
        pipeline = pipeline.png({ compressionLevel: 9 });
        outputMime = 'image/png';
      }

      const optimizedBuffer = await pipeline.toBuffer();

      // Validação estrita de magic bytes para JPEG (FF D8 FF)
      if (format === 'jpeg') {
        const isJpeg =
          optimizedBuffer.length > 3 &&
          optimizedBuffer[0] === 0xff &&
          optimizedBuffer[1] === 0xd8 &&
          optimizedBuffer[2] === 0xff;
        if (!isJpeg) {
          throw new Error('Buffer otimizado não contém magic bytes válidos de JPEG (FF D8 FF).');
        }
      }

      const optimizedBytes = optimizedBuffer.length;
      const reductionPercentage = Number(
        (((originalBytes - optimizedBytes) / originalBytes) * 100).toFixed(1)
      );

      logger.info('ImageOptimizer', 'original bytes', { bytes: originalBytes });
      logger.info('ImageOptimizer', 'optimized bytes', { bytes: optimizedBytes });
      logger.info('ImageOptimizer', 'reduction', { percentage: `${reductionPercentage}%` });

      return {
        buffer: optimizedBuffer,
        mimeType: outputMime,
        originalBytes,
        optimizedBytes,
        reductionPercentage,
      };
    } catch (err) {
      logger.warn(
        'ImageOptimizer',
        `Falha ao otimizar imagem (${err instanceof Error ? err.message : String(err)}). Utilizando buffer original como fallback.`
      );
      return {
        buffer: inputBuffer,
        mimeType: inputMimeType,
        originalBytes,
        optimizedBytes: originalBytes,
        reductionPercentage: 0,
      };
    }
  }
}
