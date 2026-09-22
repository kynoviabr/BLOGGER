import {
  AITextOptions,
  AITextResult,
  AIOptions,
  AIImageOptions,
  AIImageResult,
  AIVideoOptions,
  AIVideoResult,
} from '@/types/ai';

export interface AIProvider {
  readonly name: string;
  readonly supportedModels: string[];

  generateText(prompt: string, options?: AITextOptions): Promise<AITextResult>;
  generateStructuredOutput<T>(prompt: string, schema: unknown, options?: AIOptions): Promise<T>;
  generateImage(prompt: string, options?: AIImageOptions): Promise<AIImageResult>;
  generateVideo(prompt: string, options?: AIVideoOptions): Promise<AIVideoResult>;
}
