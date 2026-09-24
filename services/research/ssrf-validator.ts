import { URL } from 'url';

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSRFError';
  }
}

/**
 * Verifica se um endereço IPv4 é privado, reservado ou loopback.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(isNaN)) return false;

  const [a, b, c, d] = parts;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8 (Rede privada)
  if (a === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local / Cloud Metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Rede privada)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Rede privada)
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 224.0.0.0/4 (Multicast)
  if (a >= 224) return true;

  return false;
}

/**
 * Valida se uma URL é segura para requisição externa, prevenindo ataques SSRF.
 */
export function validateSafeUrl(rawUrl: string): { isValid: boolean; reason?: string; url?: URL } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, reason: 'URL vazia ou inválida' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { isValid: false, reason: 'Formato de URL inválido' };
  }

  // 1. Protocolo permitido: estritamente http: ou https:
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isValid: false, reason: `Protocolo proibido: "${parsed.protocol}"` };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // 2. Bloqueio de localhost e nomes especiais
  const blockedHosts = [
    'localhost',
    'localhost.localdomain',
    'metadata.google.internal',
    'metadata.internal',
    '169.254.169.254',
    '0.0.0.0',
    '::1',
    '[::1]',
    'broadcasthost',
  ];
  if (blockedHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { isValid: false, reason: `Hostname bloqueado para proteção SSRF: "${hostname}"` };
  }

  // 3. Bloqueio de IP numérico IPv4 privado
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      return { isValid: false, reason: `Endereço IP privado/reservado bloqueado: "${hostname}"` };
    }
  }

  // 4. Bloqueio de IPv6 privado/loopback
  if (hostname.startsWith('[') || hostname.includes(':')) {
    if (hostname.includes('::') || hostname.includes('fe80') || hostname.includes('fc00')) {
      return { isValid: false, reason: `Endereço IPv6 bloqueado para proteção SSRF: "${hostname}"` };
    }
  }

  return { isValid: true, url: parsed };
}

/**
 * Wrapper de fetch seguro com validação de SSRF e bloqueio de redirects maliciosos.
 */
export async function safeFetch(url: string, init?: RequestInit, maxRedirects = 3): Promise<Response> {
  let currentUrl = url;
  let redirectsCount = 0;

  while (redirectsCount <= maxRedirects) {
    const validation = validateSafeUrl(currentUrl);
    if (!validation.isValid) {
      throw new SSRFError(`SSRF Bloqueado: ${validation.reason} (${currentUrl})`);
    }

    const response = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      return response;
    }

    const nextUrl = new URL(location, currentUrl).toString();
    currentUrl = nextUrl;
    redirectsCount++;
  }

  throw new SSRFError(`Número excessivo de redirecionamentos (${maxRedirects})`);
}
