import { getSupabaseServerClient } from './server';
import { User } from '@supabase/supabase-js';

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
