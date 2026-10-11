import { z } from 'zod';

export const offerSchema = z.object({
  blog_id: z.string().uuid('Selecione um blog válido.'),
  title: z
    .string()
    .trim()
    .min(3, 'O título da oferta deve ter pelo menos 3 caracteres.')
    .max(255, 'Título muito longo.'),
  offer_type: z.enum(
    ['OWN_PRODUCT', 'AFFILIATE_CPA', 'AFFILIATE_TOOL', 'BOOK_AMAZON'],
    { message: 'Tipo de oferta inválido.' }
  ),
  category_ids: z.array(z.string()).default([]),
  is_global_fallback: z.boolean().default(false),
  pitch_hook: z
    .string()
    .trim()
    .min(5, 'O argumento de venda (pitch hook) deve ter pelo menos 5 caracteres.'),
  cta_button_text: z
    .string()
    .trim()
    .min(2, 'O texto do botão CTA é obrigatório.')
    .max(100, 'Texto do CTA muito longo.'),
  affiliate_url: z
    .string()
    .trim()
    .url('Informe uma URL de destino válida (ex: https://...).'),
  badge_text: z.string().trim().max(60).optional().nullable(),
  priority: z.coerce.number().int().min(1).max(10).default(5),
  is_active: z.boolean().default(true),
});

export type OfferFormValues = z.infer<typeof offerSchema>;
