/**
 * Sanitizador de injeção de prompt para conteúdo extraído de fontes externas.
 * Trata rigorosamente qualquer conteúdo da web como DADO passivo, jamais como instrução executável.
 */

// Padrões de prompt injection conhecidos
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/gi,
  /disregard\s+(all\s+)?(previous|prior)\s+instructions/gi,
  /system\s+(prompt|message|directive|override)/gi,
  /you\s+are\s+now\s+(a|an)?/gi,
  /act\s+as\s+(a|an)?/gi,
  /reveal\s+(all\s+)?(secrets?|passwords?|keys?|tokens?|env)/gi,
  /send\s+(the\s+)?(api[_-]?key|secret|credential)/gi,
  /print\s+(env|environment\s+variables?|keys?)/gi,
  /execute\s+(this\s+)?(command|script|code|shell)/gi,
  /new\s+instruction:/gi,
  /override\s+system\s+prompt/gi,
  /reset\s+context/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
];

/**
 * Remove tentativas de jailbreak e prompt injection em texto externo.
 */
export function sanitizeUntrustedText(text: string): string {
  if (!text) return "";

  let sanitized = text
    // Remove caracteres de controle ASCII exceto quebras de linha e tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    // Remove delimitadores especiais de LLMs
    .replace(/<\|.*?\|>/g, " ")
    .trim();

  // Neutraliza padrões de injection substituindo por [instrução_externa_desarmada]
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[instrução_bloqueada_por_segurança]");
  }

  return sanitized;
}

/**
 * Encapsula o dado factual externo em bloco seguro e imutável para o prompt do modelo.
 */
export function wrapInFactualDataContainer(content: string, label = "EXTERNAL_UNTRUSTED_FACT_DATA"): string {
  const clean = sanitizeUntrustedText(content);
  return `<<<${label}_START>>>\n${clean}\n<<<${label}_END>>>`;
}
