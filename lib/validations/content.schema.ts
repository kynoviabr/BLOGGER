import { z } from 'zod';

export const updateContentSchema = z.object({
  title: z.string().trim().min(3, 'O título do artigo deve ter ao menos 3 caracteres.').max(300),
  slug: z.string().trim().min(2, 'O slug é obrigatório.').max(350).regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens.'),
  excerpt: z.string().trim().max(1000).optional().nullable(),
  body: z.string().default(''),
  status: z.enum(['draft', 'reviewing', 'ready', 'scheduled', 'published', 'archived'], {
    message: 'Status do artigo inválido.',
  }),
  seo_title: z.string().trim().max(150).optional().nullable(),
  meta_description: z.string().trim().max(300).optional().nullable(),
});

export type UpdateContentInput = z.infer<typeof updateContentSchema>;
