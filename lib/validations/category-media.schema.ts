import { z } from 'zod';

export const createCategorySchema = z.object({
  blog_id: z.string().uuid('ID de blog inválido.'),
  name: z.string().trim().min(2, 'O nome da categoria deve ter ao menos 2 caracteres.').max(100),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens.').optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().nullable(),
  parent_id: z.string().uuid('ID de categoria pai inválido.').optional().nullable().or(z.literal('')),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2, 'O nome da categoria deve ter ao menos 2 caracteres.').max(100),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens.').optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().nullable(),
  parent_id: z.string().uuid('ID de categoria pai inválido.').optional().nullable().or(z.literal('')),
});

export const mediaMetadataSchema = z.object({
  blog_id: z.string().uuid('ID de blog inválido.'),
  content_id: z.string().uuid('ID de conteúdo inválido.').optional().nullable(),
  file_name: z.string().trim().min(1, 'Nome do arquivo é obrigatório.').max(255),
  file_url: z.string().trim().url('URL do arquivo de mídia inválida.'),
  media_type: z.enum(['image', 'video', 'audio', 'document']).default('image'),
  mime_type: z.string().trim().max(100).optional().nullable(),
  alt_text: z.string().trim().max(300).optional().nullable(),
  title: z.string().trim().max(200).optional().nullable(),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
  size_bytes: z.number().int().nonnegative().optional().nullable(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type MediaMetadataInput = z.infer<typeof mediaMetadataSchema>;
