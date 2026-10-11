export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  region: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'pt-BR', name: 'Português (Brasil)', nativeName: 'Português', flag: '🇧🇷', region: 'Brasil' },
  { code: 'en-US', name: 'English (US)', nativeName: 'English (US)', flag: '🇺🇸', region: 'United States' },
  { code: 'en-AU', name: 'English (Australia)', nativeName: 'English (AU)', flag: '🇦🇺', region: 'Australia' },
  { code: 'en-GB', name: 'English (UK)', nativeName: 'English (UK)', flag: '🇬🇧', region: 'United Kingdom' },
  { code: 'es-ES', name: 'Español', nativeName: 'Español', flag: '🇪🇸', region: 'España / Global' },
  { code: 'de-DE', name: 'Deutsch (Alemão)', nativeName: 'Deutsch', flag: '🇩🇪', region: 'Deutschland' },
  { code: 'pl-PL', name: 'Polski (Polonês)', nativeName: 'Polski', flag: '🇵🇱', region: 'Polska' },
];

export function getLanguageConfig(code?: string): SupportedLanguage {
  if (!code) return SUPPORTED_LANGUAGES[0];
  const found = SUPPORTED_LANGUAGES.find(
    (l) => l.code.toLowerCase() === code.toLowerCase() || l.code.split('-')[0].toLowerCase() === code.toLowerCase()
  );
  return found || SUPPORTED_LANGUAGES[0];
}

/**
 * Retorna o parágrafo de disclaimer legal formatado em HTML nativo para cada idioma.
 */
export function getLegalDisclaimerHtml(code?: string, isInvestment = false): string {
  const normalized = (code || 'pt-BR').toLowerCase();

  if (normalized.startsWith('en')) {
    if (isInvestment) {
      return '<p class="ud-aviso"><strong>Disclaimer:</strong> This content is for informational purposes only and does not constitute financial, investment, or legal advice. Investments carry inherent risks, and past performance does not guarantee future results. Verify terms and conditions directly with regulated financial institutions.</p>';
    }
    return '<p class="ud-aviso"><strong>Disclaimer:</strong> This content is for educational and informational purposes only and does not constitute financial advice. Rates, terms, and regulatory criteria may change over time; always verify with official institutional channels.</p>';
  }

  if (normalized.startsWith('es')) {
    if (isInvestment) {
      return '<p class="ud-aviso"><strong>Aviso:</strong> Este contenido es de carácter informativo y educativo; no constituye asesoramiento financiero ni de inversión. Las inversiones conllevan riesgos y la rentabilidad pasada no garantiza rendimientos futuros. Confirme siempre las condiciones en entidades reguladas.</p>';
    }
    return '<p class="ud-aviso"><strong>Aviso:</strong> Contenido meramente informativo, no representa recomendación financiera. Las tasas, comisiones y condiciones pueden variar; consulte siempre los canales oficiales de cada entidad.</p>';
  }

  if (normalized.startsWith('de')) {
    if (isInvestment) {
      return '<p class="ud-aviso"><strong>Hinweis:</strong> Dieser Inhalt dient reinen Informations- und Bildungszwecken und stellt keine Anlageberatung dar. Investitionen bergen Verlustrisiken und vergangene Wertentwicklungen sind keine Garantie für die Zukunft. Bitte prüfen Sie Konditionen bei lizenzierten Kreditinstituten.</p>';
    }
    return '<p class="ud-aviso"><strong>Hinweis:</strong> Rein informativer Inhalt, keine Finanzberatung. Zinssätze und gesetzliche Regelungen können sich ändern; bitte informieren Sie sich stets bei den offiziellen Stellen.</p>';
  }

  if (normalized.startsWith('pl')) {
    if (isInvestment) {
      return '<p class="ud-aviso"><strong>Zastrzeżenie:</strong> Niniejsza treść ma charakter wyłącznie edukacyjny i informacyjny, nie stanowiąc rekomendacji inwestycyjnej ani doradztwa finansowego. Inwestycje wiążą się z ryzykiem utraty kapitału, a wyniki historyczne nie gwarantują przyszłych zysków. Zawsze weryfikuj warunki w instytucjach nadzorowanych.</p>';
    }
    return '<p class="ud-aviso"><strong>Zastrzeżenie:</strong> Treść wyłącznie informacyjna, nie stanowi porady finansowej. Oprocentowanie i regulacje podlegają zmianom; warunki należy zawsze potwierdzić w oficjalnych kanałach banków i instytucji.</p>';
  }

  // Fallback: pt-BR
  if (isInvestment) {
    return '<p class="ud-aviso"><strong>Aviso:</strong> conteúdo informativo, não é recomendação financeira. Investimentos envolvem riscos e rentabilidade passada não garante resultados futuros. Confirme prazos e taxas nos canais oficiais.</p>';
  }
  return '<p class="ud-aviso"><strong>Aviso:</strong> conteúdo informativo, não é recomendação financeira. Taxas e regras mudam; confirme nos canais oficiais das instituições.</p>';
}

/**
 * Retorna palavras de alta frequência para conferência de idioma no Quality Gate.
 */
export function getLanguageStopWords(code?: string): string[] {
  const normalized = (code || 'pt-BR').toLowerCase();

  if (normalized.startsWith('en')) {
    return ['the', 'and', 'with', 'for', 'that', 'this', 'your', 'from', 'have', 'financial'];
  }
  if (normalized.startsWith('es')) {
    return ['que', 'para', 'con', 'una', 'como', 'este', 'esta', 'financiero', 'usted', 'sus'];
  }
  if (normalized.startsWith('de')) {
    return ['und', 'der', 'die', 'das', 'für', 'mit', 'eine', 'nicht', 'sich', 'sie'];
  }
  if (normalized.startsWith('pl')) {
    return ['nie', 'się', 'dla', 'jak', 'oraz', 'jest', 'jego', 'twoje', 'przez', 'może'];
  }
  // pt-BR
  return ['que', 'para', 'com', 'não', 'uma', 'como', 'você', 'seu', 'sua'];
}

/**
 * Retorna a diretriz de sistema para o idioma e regionalismo selecionado nos prompts de IA.
 */
export function getLanguagePromptDirective(code?: string): string {
  const normalized = (code || 'pt-BR').toLowerCase();

  if (normalized === 'en-us') {
    return `==================================================
IDIOMA E LOCALIZAÇÃO: AMERICAN ENGLISH (en-US)
==================================================
- Write strictly in American English (en-US).
- Use US spelling, grammar, and idioms (e.g., "color", "optimize", "check", "inquire", "enroll").
- Use US financial terminology where appropriate (checking account, APR, credit score/FICO, 401(k), IRS, CFPB).
- The text must sound as if written by a senior American financial journalist or Wall Street editorial strategist.`;
  }

  if (normalized === 'en-au') {
    return `==================================================
IDIOMA E LOCALIZAÇÃO: AUSTRALIAN ENGLISH (en-AU)
==================================================
- Write strictly in Australian English (en-AU).
- Use British/Australian spelling (e.g., "colour", "optimise", "cheque", "enrol").
- Adapt to the Australian financial framework where relevant (Superannuation, ATO, ASIC, Big Four banks, Medicare levy, mortgage offset).
- The tone must be clear, pragmatic, engaging, and sound natively Australian.`;
  }

  if (normalized === 'en-gb') {
    return `==================================================
IDIOMA E LOCALIZAÇÃO: BRITISH ENGLISH (en-GB)
==================================================
- Write strictly in British English (en-GB).
- Use UK spelling, phrasing, and grammar (e.g., "colour", "optimise", "cheque", "programme", "whilst").
- Contextualize with UK financial concepts where relevant (Current account, ISA, FCA, HMRC, Bank of England, credit rating).
- The text must sound authoritative, sophisticated, and authentically British.`;
  }

  if (normalized.startsWith('es')) {
    return `==================================================
IDIOMA E LOCALIZAÇÃO: ESPAÑOL (es-ES / Global)
==================================================
- Escriba exclusivamente en Español neutro y formal de alta calidad periodística.
- Utilice ortografía impecable, tildes precisas y estructura gramatical natural.
- Emplee terminología financiera clara (cuentas corrientes, tarjetas de crédito, historial crediticio, fondos de inversión, intereses TAE/TIN).
- Evite modismos regionales locales excesivos; el texto debe sonar profesional y accesible para toda la comunidad hispanohablante.`;
  }

  if (normalized.startsWith('de')) {
    return `==================================================
IDIOMA E LOCALIZAÇÃO: DEUTSCH (de-DE)
==================================================
- Schreiben Sie ausschließlich in fehlerfreiem, professionellem Deutsch (de-DE).
- Verwenden Sie die förmliche Anrede ("Sie", "Ihr", "Ihre") für die Leserschaft.
- Nutzen Sie präzise deutsche Finanzterminologie (Girokonto, Tagesgeld, Festgeld, Schufa, BaFin, Zinsen, ETF-Sparplan).
- Der Text muss wie von einem erfahrenen Wirtschaftsredakteur eines renommierten deutschen Finanzportals klingen.`;
  }

  if (normalized.startsWith('pl')) {
    return `==================================================
IDIOMA E LOCALIZAÇÃO: POLSKI (pl-PL)
==================================================
- Pisz wyłącznie w naturalnym, poprawnym języku polskim (pl-PL).
- Zadbaj o bezbłędną gramatykę, fleksję i polskie znaki diakrytyczne (ą, ę, ś, ć, ż, ź, ł, ó, ń).
- Stosuj terminologię polskiego rynku finansowego (konto osobiste, kredyt gotówkowy, BIK, KNF, RRSO, lokata bankowa, obligacje skarbowe).
- Tekst musi brzmieć jak profesjonalny artykuł z czołowego polskiego portalu finansowo-biznesowego.`;
  }

  // Default: pt-BR
  return `==================================================
IDIOMA E NATURALIDADE BRASILEIRA (pt-BR)
==================================================
- Escreva exclusivamente em Português do Brasil (pt-BR).
- Utilize vocabulário, construções gramaticais, pontuação, expressões e terminologia naturais do português brasileiro.
- NUNCA utilize construções em português europeu (ex: utilize "você está fazendo" e jamais "está a fazer"; utilize "celular" e jamais "telemóvel").
- Evite traduções literais do inglês ou estruturas com tom de texto traduzido.
- O texto deve soar impecável, soando como redação nativa de um experiente jornalista ou redator sênior brasileiro.`;
}
