export type OfferType =
  | 'OWN_PRODUCT'
  | 'AFFILIATE_CPA'
  | 'AFFILIATE_TOOL'
  | 'BOOK_AMAZON';

export interface MonetizationOffer {
  id: string;
  blog_id: string;
  title: string;
  offer_type: OfferType;
  category_ids: string[];
  is_global_fallback: boolean;
  pitch_hook: string;
  cta_button_text: string;
  affiliate_url: string;
  badge_text: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  blog?: {
    id: string;
    name: string;
    slug: string;
    domain: string;
  };
}

export type CreateOfferInput = Omit<
  MonetizationOffer,
  'id' | 'created_at' | 'updated_at' | 'blog'
>;

export type UpdateOfferInput = Partial<CreateOfferInput>;

export const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  OWN_PRODUCT: 'Produto Próprio (E-book / Curso)',
  AFFILIATE_CPA: 'Afiliado CPA (Conta / Cartão / Empréstimo)',
  AFFILIATE_TOOL: 'Ferramenta / Software Parceiro',
  BOOK_AMAZON: 'Livro Recomendado (Amazon)',
};
