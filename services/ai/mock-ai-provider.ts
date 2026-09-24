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
    existingIdeas?: Array<{ title: string }>;
  }): Promise<{ title: string; keywords: string; description: string; type: string }> {
    const cat = context.category || 'Empréstimos';
    const pos = ((context.queuePosition || 1) - 1) % 5;

    const templates = [
      {
        title: `Guia Definitivo do ${cat} Consignado: Regras e Taxas 2026`,
        keywords: `${cat}, crédito consignado, taxas de juros, aposentados`,
        description: `Visão aprofundada sobre funcionamento, limites de margem e cuidados contra fraudes no ${cat}.`,
        type: 'Guia Completo',
      },
      {
        title: `${cat} com Garantia de Imóvel vs Veículo: Qual Vale Mais a Pena?`,
        keywords: `garantia de imóvel, refinanciamento de veículo, ${cat}, juros baixos`,
        description: `Comparativo detalhado de taxas, prazos de amortização e análise de risco para cada modalidade.`,
        type: 'Lista Comparativa',
      },
      {
        title: `5 Cuidados Cruciais Antes de Contratar ${cat} Pessoal Online`,
        keywords: `segurança financeira, ${cat} online, evitar golpes, score`,
        description: `Orientações práticas para checar a idoneidade da financeira e não cair no golpe do depósito antecipado.`,
        type: 'Dicas Práticas',
      },
      {
        title: `Portabilidade de ${cat}: Como Reduzir os Juros da Sua Dívida`,
        keywords: `portabilidade de crédito, renegociação, taxa selic, ${cat}`,
        description: `Passo a passo descomplicado para migrar contratos de crédito para instituições com juros menores.`,
        type: 'Passo a Passo',
      },
      {
        title: `${cat} para Negativados: Riscos, Direitos e Alternativas Reais`,
        keywords: `crédito para negativados, score baixo, sair das dívidas, ${cat}`,
        description: `Análise franca sobre o custo efetivo total, riscos de superendividamento e alternativas seguras.`,
        type: 'Análise Crítica',
      },
    ];

    return templates[pos];
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
