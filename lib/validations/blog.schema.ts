import { z } from 'zod';

export const createBlogSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(100, 'Nome muito longo.'),
  slug: z.string().trim().max(120).optional().or(z.literal('')),
  domain: z.string().trim().min(3, 'Domínio inválido.').max(255).regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Formato de domínio inválido (ex: meublog.com)'),
  niche: z.string().trim().min(2, 'Informe o nicho de atuação.').max(100),
  audience: z.string().trim().max(200).optional().nullable(),
  default_language: z.string().trim().min(2).max(10).default('pt-BR'),
  description: z.string().trim().max(1000).optional().nullable(),
  wp_site_url: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  wp_username: z.string().trim().max(100).optional().nullable().or(z.literal('')),
  wp_application_password: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const updateBlogSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(100),
  domain: z.string().trim().min(3, 'Domínio inválido.').max(255).regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Formato de domínio inválido'),
  niche: z.string().trim().min(2, 'Informe o nicho.').max(100),
  audience: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  default_language: z.string().trim().min(2).max(10).optional(),
  status: z.enum(['active', 'inactive', 'archived'], {
    message: 'Status do blog inválido.',
  }),
  wp_site_url: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  wp_username: z.string().trim().max(100).optional().nullable().or(z.literal('')),
  wp_application_password: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export type CreateBlogInput = z.infer<typeof createBlogSchema>;
export type UpdateBlogInput = z.infer<typeof updateBlogSchema>;
