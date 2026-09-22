import { AIProvider } from './provider.interface';
import {
  AITextOptions,
  AITextResult,
  AIOptions,
  AIImageOptions,
  AIImageResult,
  AIVideoOptions,
  AIVideoResult,
} from '@/types/ai';
import { logger } from '@/lib/logger';

export class MockAIProvider implements AIProvider {
  readonly name = 'MockAIProvider';
  readonly supportedModels = ['mock-fast', 'mock-deep', 'gemini-2.5-flash-stub'];

  async generateText(prompt: string, options?: AITextOptions): Promise<AITextResult> {
    logger.info('MockAIProvider', 'generateText called', { promptSnippet: prompt.slice(0, 60), options });

    return {
      text: `[MOCK AI OUTPUT] Conteúdo gerado para o prompt: "${prompt.slice(0, 80)}..."\n\nEste é um texto de fundação estruturado com introdução, tópicos e conclusão formatados para validação da pipeline.`,
      model: options?.model || 'mock-fast',
      provider: this.name,
      finishReason: 'STOP',
      usage: {
        promptTokens: 120,
        completionTokens: 350,
        totalTokens: 470,
        estimatedCostUsd: 0.00025,
      },
    };
  }

  async generateStructuredOutput<T>(prompt: string, schema: unknown, options?: AIOptions): Promise<T> {
    logger.info('MockAIProvider', 'generateStructuredOutput called', { promptSnippet: prompt.slice(0, 60) });

    // Retorna payload tipado genérico simulado
    const mockOutput = {
      title: 'Título Sugerido pela IA',
      metaDescription: 'Descrição gerada para fins de SEO e indexação em motores de busca.',
      sections: [
        { heading: 'Introdução', keyPoints: ['Ponto A', 'Ponto B'] },
        { heading: 'Análise Aprofundada', keyPoints: ['Ponto C', 'Ponto D'] },
      ],
      keywords: ['ia', 'automacao', 'content factory'],
    };

    return mockOutput as unknown as T;
  }

  async generateImage(prompt: string, options?: AIImageOptions): Promise<AIImageResult> {
    logger.info('MockAIProvider', 'generateImage called', { prompt, options });

    return {
      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
      storagePath: `mock/images/${Date.now()}.webp`,
      altText: `Imagem de destaque conceitual gerada para: ${prompt.slice(0, 40)}`,
      prompt,
      provider: this.name,
    };
  }

  async generateVideo(prompt: string, options?: AIVideoOptions): Promise<AIVideoResult> {
    logger.info('MockAIProvider', 'generateVideo called', { prompt, options });

    return {
      videoUrl: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
      storagePath: `mock/videos/${Date.now()}.mp4`,
      durationSeconds: options?.durationSeconds || 5,
      provider: this.name,
    };
  }
}
