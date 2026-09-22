import { NextRequest } from 'next/server';

/**
 * Valida a autenticação do acionador do Cron Job.
 * Aceita o header padrão da Vercel: Authorization: Bearer <CRON_SECRET>
 */
export function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // Se CRON_SECRET não estiver configurado no ambiente, bloqueia por padrão de segurança
  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return false;
  }

  return token === cronSecret;
}
