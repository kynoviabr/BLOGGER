import { z } from 'zod';

export const createCalendarItemSchema = z.object({
  blog_id: z.string().uuid('ID de blog inválido.'),
  category_id: z.string().uuid('ID de categoria inválido.').optional().nullable().or(z.literal('')),
  language: z.string().trim().min(2).max(10).default('pt-BR'),
  topic: z.string().trim().min(3, 'O tema é obrigatório e deve ter ao menos 3 caracteres.').max(500),
  proposed_title: z.string().trim().min(3, 'O título proposto deve ter ao menos 3 caracteres.').max(300),
  keywords: z.array(z.string().trim().min(1)).default([]),
  article_type: z.string().trim().min(2).max(50).default('standard'),
  scheduled_at: z.string().datetime({ offset: true }).optional().nullable().or(z.literal('')),
  priority: z.enum(['low', 'medium', 'high'], {
    message: 'Prioridade inválida.',
  }).default('medium'),
  status: z.enum(['IDEA', 'PLANNED', 'IN_PROGRESS', 'READY', 'SCHEDULED', 'PUBLISHED', 'FAILED'], {
    message: 'Status de pauta inválido.',
  }).default('PLANNED'),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updateCalendarItemSchema = z.object({
  topic: z.string().trim().min(3, 'O tema deve ter pelo menos 3 caracteres.').max(500),
  proposed_title: z.string().trim().min(3, 'O título proposto deve ter pelo menos 3 caracteres.').max(300),
  priority: z.enum(['low', 'medium', 'high'], { message: 'Prioridade inválida.' }),
  status: z.enum(['IDEA', 'PLANNED', 'IN_PROGRESS', 'READY', 'SCHEDULED', 'PUBLISHED', 'FAILED'], { message: 'Status inválido.' }),
  scheduled_at: z.string().datetime({ offset: true }).optional().nullable().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type CreateCalendarItemInput = z.infer<typeof createCalendarItemSchema>;
export type UpdateCalendarItemInput = z.infer<typeof updateCalendarItemSchema>;
