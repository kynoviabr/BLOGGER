export interface GeneratedImage {
  imageUrl: string;
  base64?: string;
  buffer?: Buffer;
  mimeType: string;
  altText?: string;
  provider: string;
}

export interface ImageGenerationOptions {
  aspectRatio?: '1:1' | '16:9' | '4:3' | '9:16';
  style?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}

export interface ImageProvider {
  readonly name: string;

  /**
   * Gera uma imagem de destaque a partir de um prompt e opções de dimensão/estilo.
   */
  generateFeaturedImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<GeneratedImage>;
}
