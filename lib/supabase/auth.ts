import { getSupabaseServerClient } from './server';
import { User } from '@supabase/supabase-js';
import { OrganizationRole } from '@/types/database';
import { cookies } from 'next/headers';

export const ACTIVE_ORGANIZATION_COOKIE = 'selected_organization_id';

export class AuthenticationError extends Error {
  constructor(message = 'Acesso não autorizado. Faça login para continuar.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Obtém o usuário atualmente autenticado a partir dos cookies de sessão.
 * Utiliza auth.getUser() que valida o token no servidor Supabase Auth (ao invés de apenas ler o JWT local).
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

/**
 * Exige que a requisição seja proveniente de um usuário autenticado.
 * Utilizada obrigatoriamente no início de todas as Server Actions administrativas.
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthenticationError('Acesso não autorizado. Sessão inválida ou expirada.');
  }

  return user;
}

export interface OrganizationMembershipContext {
  user: User;
  organizationId: string;
  role: OrganizationRole;
}

/**
 * Resolves an active organization membership for the current user.
 * RLS remains the final authorization boundary; this helper provides an
 * explicit organization id for create operations and clearer failures.
 */
export async function requireOrganizationMembership(
  preferredOrganizationId?: string
): Promise<OrganizationMembershipContext> {
  const user = await requireAuth();
  const supabase = await getSupabaseServerClient();
  const cookieStore = await cookies();
  const organizationId = preferredOrganizationId || cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  let query = supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    throw new AuthenticationError('Usuário sem acesso ativo a uma organização.');
  }

  return {
    user,
    organizationId: data.organization_id,
    role: data.role,
  };
}

export async function getActiveOrganizationId(): Promise<string> {
  return (await requireOrganizationMembership()).organizationId;
}
