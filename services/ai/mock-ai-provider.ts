import {
  AIProvider,
  GeneratedArticle,
  ArticleGenerationContext,
} from './ai-provider.interface';
import {
  ImageProvider,
  GeneratedImage,
  ImageGenerationOptions,
} from './image-provider.interface';
import { logger } from '@/lib/logger';

export class MockAIProvider implements AIProvider {
  readonly name = 'MockAIProvider';
  readonly defaultModel = 'mock-text-v1';

  async generateArticle(
    title: string,
    keywords: string[],
    context?: ArticleGenerationContext
  ): Promise<GeneratedArticle> {
    logger.info(this.name, `Geração simulada de artigo: "${title}"`, { keywords, context });

    const slug = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    return {
      title,
      slug,
      metaDescription: `Guia completo e descomplicado sobre ${title}. Descubra dicas financeiras práticas e estratégias comprovadas.`,
      content: `## Introdução\n\nNeste artigo prático sobre **${title}**, vamos analisar os principais fundamentos econômicos e passos essenciais para tomada de decisão consciente.\n\n## Principais Vantagens e Riscos\n\n- **Rentabilidade e Liquidez:** Compreenda o impacto no seu orçamento.\n- **Taxas e Custos Ocultos:** Mantenha o foco na eficiência patrimonial.\n\n## Conclusão e Isenção de Responsabilidade\n\nEste material tem caráter educativo e informativo.`,
      keywords,
      readingTimeMinutes: 5,
    };
  }

  async generateIdeas(context: {
    niche?: string;
    category?: string;
    count?: number;
  }): Promise<Array<{ title: string; keywords: string; description: string; type: string }>> {
    const cat = context.category || 'Finanças';
    return [
      {
        title: `Como escolher o melhor produto de ${cat} em 2026`,
        keywords: `${cat}, dicas financeiras, economia, planejamento`,
        description: `Guia comparativo detalhado analisando opções de ${cat}, vantagens, desvantagens e taxas.`,
        type: 'Guia Completo',
      },
      {
        title: `5 Erros comuns ao lidar com ${cat} e como evitá-los`,
        keywords: `erros financeiros, ${cat}, como economizar, score`,
        description: `Lista prática com os 5 erros mais frequentes dos brasileiros ao contratar ${cat}.`,
        type: 'Lista / Dicas',
      },
    ];
  }

  async generateIdea(context: {
    category?: string;
    queuePosition?: number;
  }): Promise<{ title: string; keywords: string; description: string; type: string }> {
    const cat = context.category || 'Finanças';
    const pos = context.queuePosition || 1;
    return {
      title: `Guia Estratégico de ${cat} #${pos}: Passo a Passo 2026`,
      keywords: `${cat}, planejamento, economia, dicas 2026`,
      description: `Análise estruturada sobre ${cat} abordando regras, direitos e simulações práticas.`,
      type: 'Guia Completo',
    };
  }
}

export class MockImageProvider implements ImageProvider {
  readonly name = 'MockImageProvider';

  async generateFeaturedImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<GeneratedImage> {
    logger.info(this.name, `Geração simulada de imagem`, { prompt, options });

    return {
      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
      base64: undefined,
      mimeType: 'image/webp',
      altText: `Imagem de destaque simulada para: ${prompt.slice(0, 40)}`,
      provider: this.name,
    };
  }
}
