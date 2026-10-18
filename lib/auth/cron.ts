import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Valida a autenticação do acionador do Cron Job.
 * Aceita o header padrão da Vercel: Authorization: Bearer <CRON_SECRET>
 */
export function verifyCronSecret(request: NextRequest): boolean {
  const cronSecrets = [process.env.CRON_SECRET, process.env.CRON_SECRET_PREVIOUS]
    .filter((secret): secret is string => Boolean(secret));

  // Se CRON_SECRET não estiver configurado no ambiente, bloqueia por padrão de segurança
  if (cronSecrets.length === 0) {
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

  const tokenBuffer = Buffer.from(token);

  return cronSecrets.some((secret) => {
    const secretBuffer = Buffer.from(secret);

    return tokenBuffer.length === secretBuffer.length
      && timingSafeEqual(tokenBuffer, secretBuffer);
  });
}
