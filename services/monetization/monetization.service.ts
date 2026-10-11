import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { MonetizationOffer, CreateOfferInput, UpdateOfferInput } from '@/types/monetization';
import { logger } from '@/lib/logger';

export class MonetizationService {
  /**
   * Busca determinística de ofertas para uma categoria específica de um blog.
   * - Filtra por blog_id e is_active = true.
   * - Retorna ofertas que contêm o categoryIdOrSlug em category_ids OU is_global_fallback = true.
   * - Ordenação: 'OWN_PRODUCT' sempre no topo, seguido de priority DESC.
   * - Retorna no máximo 2 ofertas (Principal e Secundária).
   */
  static async getOffersForCategory(
    blogId: string,
    categoryIdOrSlug: string
  ): Promise<MonetizationOffer[]> {
    try {
      const supabase = getSupabaseAdminClient();
      const normalizedCat = (categoryIdOrSlug || '').toLowerCase().trim();

      const { data, error } = await supabase
        .from('monetization_offers')
        .select('*')
        .eq('blog_id', blogId)
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) {
        logger.error('MonetizationService.getOffersForCategory', 'Erro ao consultar ofertas', {
          blogId,
          categoryIdOrSlug,
          error,
        });
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Filtra deterministicamente: match exato na categoria OU fallback global
      const matchingOffers = (data as MonetizationOffer[]).filter((offer) => {
        const matchesCategory =
          Array.isArray(offer.category_ids) &&
          offer.category_ids.some(
            (c) => c.toLowerCase().trim() === normalizedCat
          );

        return matchesCategory || offer.is_global_fallback;
      });

      // Ordenação determinística:
      // 1. OWN_PRODUCT no topo (máxima margem)
      // 2. Se ambos forem OWN_PRODUCT ou ambos forem de outro tipo, desempate por priority DESC
      matchingOffers.sort((a, b) => {
        const aIsOwn = a.offer_type === 'OWN_PRODUCT' ? 1 : 0;
        const bIsOwn = b.offer_type === 'OWN_PRODUCT' ? 1 : 0;
        if (aIsOwn !== bIsOwn) {
          return bIsOwn - aIsOwn;
        }
        return b.priority - a.priority;
      });

      // Retorna no máximo 2 ofertas
      return matchingOffers.slice(0, 2);
    } catch (err) {
      logger.error('MonetizationService.getOffersForCategory', 'Exceção ao buscar ofertas', {
        err,
      });
      return [];
    }
  }

  /**
   * Lista todas as ofertas cadastradas (opcionalmente filtrando por blog).
   */
  static async listOffers(blogId?: string): Promise<MonetizationOffer[]> {
    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from('monetization_offers')
      .select('*, blog:blogs(id, name, slug, domain)')
      .order('created_at', { ascending: false });

    if (blogId) {
      query = query.eq('blog_id', blogId);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('MonetizationService.listOffers', 'Erro ao listar ofertas', { error });
      throw new Error(`Falha ao listar ofertas: ${error.message}`);
    }

    return (data || []) as MonetizationOffer[];
  }

  /**
   * Obtém uma oferta por ID.
   */
  static async getOfferById(id: string): Promise<MonetizationOffer | null> {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('monetization_offers')
      .select('*, blog:blogs(id, name, slug, domain)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.error('MonetizationService.getOfferById', `Erro ao buscar oferta ${id}`, { error });
      return null;
    }

    return data as MonetizationOffer | null;
  }

  /**
   * Cria uma nova oferta de monetização.
   */
  static async createOffer(input: CreateOfferInput): Promise<MonetizationOffer> {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('monetization_offers')
      .insert({
        blog_id: input.blog_id,
        title: input.title,
        offer_type: input.offer_type,
        category_ids: input.category_ids || [],
        is_global_fallback: input.is_global_fallback ?? false,
        pitch_hook: input.pitch_hook,
        cta_button_text: input.cta_button_text,
        affiliate_url: input.affiliate_url,
        badge_text: input.badge_text || null,
        priority: input.priority ?? 5,
        is_active: input.is_active ?? true,
      })
      .select('*, blog:blogs(id, name, slug, domain)')
      .single();

    if (error) {
      logger.error('MonetizationService.createOffer', 'Erro ao criar oferta', { error });
      throw new Error(`Falha ao criar oferta: ${error.message}`);
    }

    return data as MonetizationOffer;
  }

  /**
   * Atualiza uma oferta existente.
   */
  static async updateOffer(id: string, updates: UpdateOfferInput): Promise<MonetizationOffer> {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('monetization_offers')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, blog:blogs(id, name, slug, domain)')
      .single();

    if (error) {
      logger.error('MonetizationService.updateOffer', `Erro ao atualizar oferta ${id}`, { error });
      throw new Error(`Falha ao atualizar oferta: ${error.message}`);
    }

    return data as MonetizationOffer;
  }

  /**
   * Alterna o status ativo/inativo da oferta.
   */
  static async toggleOfferStatus(id: string): Promise<boolean> {
    const current = await this.getOfferById(id);
    if (!current) {
      throw new Error('Oferta não encontrada');
    }

    const nextStatus = !current.is_active;
    await this.updateOffer(id, { is_active: nextStatus });
    return nextStatus;
  }

  /**
   * Exclui uma oferta.
   */
  static async deleteOffer(id: string): Promise<void> {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('monetization_offers')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('MonetizationService.deleteOffer', `Erro ao excluir oferta ${id}`, { error });
      throw new Error(`Falha ao excluir oferta: ${error.message}`);
    }
  }
}
