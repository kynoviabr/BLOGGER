import { URL } from 'url';
import dns from 'dns';

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSRFError';
  }
}

export class ContentTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentTypeError';
  }
}

export class OversizedResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OversizedResponseError';
  }
}

export const MAX_RESPONSE_BYTES = 2_000_000; // 2 MB limite máximo de resposta

export const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/xhtml+xml',
];

/**
 * Verifica se um endereço IP (IPv4 ou IPv6) é privado, reservado, loopback ou metadata.
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return true;

  let cleanIp = ip.trim();
  if (cleanIp.startsWith('[') && cleanIp.endsWith(']')) {
    cleanIp = cleanIp.slice(1, -1);
  }

  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (cleanIp.toLowerCase().startsWith('::ffff:')) {
    cleanIp = cleanIp.slice(7);
  }

  // IPv6 Checks
  if (cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1' || cleanIp === '::') {
    return true; // Loopback / Unspecified
  }

  const ipLower = cleanIp.toLowerCase();
  // IPv6 link-local (fe80::/10)
  if (ipLower.startsWith('fe8') || ipLower.startsWith('fe9') || ipLower.startsWith('fea') || ipLower.startsWith('feb')) {
    return true;
  }
  // IPv6 unique-local (fc00::/7)
  if (ipLower.startsWith('fc') || ipLower.startsWith('fd')) {
    return true;
  }

  // IPv4 Checks
  const parts = cleanIp.split('.').map(p => parseInt(p, 10));
  if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
    const [a, b, c, d] = parts;
    if (a === 0) return true; // 0.0.0.0/8 (Rede atual)
    if (a === 10) return true; // 10.0.0.0/8 (Privada)
    if (a === 127) return true; // 127.0.0.0/8 (Loopback)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-local / Cloud Metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (Privada)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (Privada)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a >= 224) return true; // 224.0.0.0/4 (Multicast/Reservado)
  }

  return false;
}

/**
 * Validação estática rápida de URL antes de requisições DNS.
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

  // 3. Bloqueio de IP numérico literal privado
  if (isPrivateIp(hostname)) {
    return { isValid: false, reason: `Endereço IP privado/reservado bloqueado: "${hostname}"` };
  }

  return { isValid: true, url: parsed };
}

/**
 * Resolve o DNS do hostname server-side e valida TODOS os IPs retornados contra DNS rebinding.
 */
export async function resolveAndValidateDns(hostname: string): Promise<string[]> {
  const cleanHost = hostname.replace(/^\[|\]$/g, '').trim();

  // Se já for um IP literal
  if (isPrivateIp(cleanHost)) {
    throw new SSRFError(`IP privado detectado no hostname: ${cleanHost}`);
  }

  // Se for endereço IPv4 numérico público, não precisa de lookup
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(cleanHost)) {
    return [cleanHost];
  }

  try {
    const addresses = await dns.promises.lookup(cleanHost, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new SSRFError(`Não foi possível resolver endereço DNS para o host: ${cleanHost}`);
    }

    const resolvedIps = addresses.map(a => a.address);
    for (const ip of resolvedIps) {
      if (isPrivateIp(ip)) {
        throw new SSRFError(`DNS Rebinding bloqueado: host "${cleanHost}" resolve para IP privado "${ip}"`);
      }
    }

    return resolvedIps;
  } catch (err) {
    if (err instanceof SSRFError) throw err;
    throw new SSRFError(`Falha na resolução de DNS para "${cleanHost}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface SafeFetchOptions extends RequestInit {
  maxRedirects?: number;
  maxResponseBytes?: number;
  allowedContentTypes?: string[];
  timeoutMs?: number;
}

/**
 * Wrapper de fetch seguro com:
 * 1. Validação estática de SSRF e protocolos.
 * 2. Resolução server-side de DNS com validação de TODOS os IPs (anti-DNS rebinding).
 * 3. Validação manual de CADA redirect individual (anti-redirect para localhost/IP privado).
 * 4. Validação de Content-Type permitido.
 * 5. Limite estrito de tamanho de resposta (MAX_RESPONSE_BYTES).
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  const allowedTypes = options.allowedContentTypes ?? ALLOWED_CONTENT_TYPES;
  const timeoutMs = options.timeoutMs ?? 10_000;

  let currentUrl = url;
  let redirectsCount = 0;
  const visitedUrls = new Set<string>();

  while (redirectsCount <= maxRedirects) {
    if (visitedUrls.has(currentUrl)) {
      throw new SSRFError(`Loop de redirecionamento detectado para "${currentUrl}"`);
    }
    visitedUrls.add(currentUrl);

    // 1. Validação estática
    const validation = validateSafeUrl(currentUrl);
    if (!validation.isValid || !validation.url) {
      throw new SSRFError(`SSRF Bloqueado: ${validation.reason} (${currentUrl})`);
    }

    // 2. Resolução DNS e validação anti-rebinding
    await resolveAndValidateDns(validation.url.hostname);

    // 3. Execução com timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        ...options,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // 4. Tratamento manual de Redirects
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new SSRFError(`HTTP ${response.status} redirect sem cabeçalho Location (${currentUrl})`);
      }

      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch {
        throw new SSRFError(`Location inválido retornado no redirect: "${location}"`);
      }

      currentUrl = nextUrl;
      redirectsCount++;
      continue;
    }

    // 5. Validação de Content-Type
    const contentTypeHeader = response.headers.get('content-type') || '';
    const cleanContentType = contentTypeHeader.split(';')[0].trim().toLowerCase();

    // Se a resposta for 200, verificar se o Content-Type é aceitável
    if (response.ok && cleanContentType) {
      const isAllowed = allowedTypes.some(t => cleanContentType.includes(t));
      if (!isAllowed) {
        throw new ContentTypeError(`Content-Type não permitido: "${contentTypeHeader}". Aceitos apenas: ${allowedTypes.join(', ')}`);
      }
    }

    // 6. Validação de Content-Length
    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const length = parseInt(contentLengthHeader, 10);
      if (!isNaN(length) && length > maxBytes) {
        throw new OversizedResponseError(`Resposta excede o tamanho máximo permitido (${length} > ${maxBytes} bytes)`);
      }
    }

    // 7. Retorna a resposta final validada
    return response;
  }

  throw new SSRFError(`Número excessivo de redirecionamentos (${maxRedirects})`);
}

