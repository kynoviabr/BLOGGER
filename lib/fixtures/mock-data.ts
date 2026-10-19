import { BlogWithRelations } from '@/types/blog';
import { CalendarItemWithRelations } from '@/types/calendar';
import { ContentItemWithRelations } from '@/types/content';
import { MediaAsset } from '@/types/media';
import { SystemLog } from '@/services/log.service';

/**
 * Fixture de dados para testes unitários ou scripts de simulação de carga.
 * ATENÇÃO: Estes dados NÃO são utilizados como fallback dos services em runtime.
 */
export const fixtureBlogs: BlogWithRelations[] = [
  {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    organization_id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
    name: 'Tech & AI Insights',
    slug: 'tech-ai-insights',
    domain: 'tech-ai-insights.com',
    description: 'Blog de teste para automação de conteúdo e SEO em tecnologia.',
    niche: 'Tecnologia & IA',
    audience: 'Desenvolvedores e engenheiros',
    default_language: 'pt-BR',
    status: 'active',
    theme_config: { primary_color: '#2563eb', dark_mode: true },
    editorial_config: { min_words: 1500, max_words: 3000, tone: 'autoritário' },
    seo_config: { author_name: 'Content Factory AI' },
    monetization_config: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    languages: [
      { id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', blog_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', language: 'pt-BR', active: true, created_at: new Date().toISOString() },
    ],
    categories: [
      { id: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a31', blog_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Inteligência Artificial', slug: 'inteligencia-artificial', description: 'IA e agentes', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ],
  },
];
