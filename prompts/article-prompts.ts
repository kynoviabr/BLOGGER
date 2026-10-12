import { getLanguagePromptDirective } from '@/config/languages';

export interface YMYLPromptOptions {
  title: string;
  keywords: string[];
  niche?: string;
  audience?: string;
  language?: string;
  category?: string;
  notes?: string;
  monetizationOffer?: {
    title: string;
    pitchHook: string;
    ctaButtonText: string;
  };
  internalLinks?: Array<{
    title: string;
    slug: string;
    url: string;
    category?: string;
  }>;
}

/**
 * System Prompt com foco rigoroso em Your Money or Your Life (YMYL) no nicho financeiro.
 * Instruções orientadas a autoridade técnica (E-E-A-T), prevenção absoluta de alucinações,
 * estrutura semântica enriquecida e conformidade com diretrizes regulatórias e de SEO.
 */
export function buildYMYLFinanceSystemPrompt(language?: string, niche?: string, audience?: string): string {
  const directive = getLanguagePromptDirective(language);

  const isFinance = !niche || niche.toLowerCase().includes('finanç') || niche.toLowerCase().includes('dinheiro');
  const roleIntro = isFinance
    ? `Você é um Analista Financeiro Sênior e Especialista em SEO e Conteúdo YMYL (Your Money or Your Life).
Sua missão é produzir artigos aprofundados, didáticos, precisos e de alta credibilidade sobre finanças pessoais, economia, investimentos, crédito e planejamento orçamentário.`
    : `Você é um Redator Especialista, Jornalista Sênior e Autoridade em SEO no nicho de ${niche}.
Sua missão é produzir artigos aprofundados, didáticos, precisos e de alta credibilidade voltados para ${audience || 'o público leitor do portal'}.`;

  return `${roleIntro}

${directive}

### DIRETRIZES DE QUALIDADE & E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness):
1. **Veracidade e Rigor Técnico (Sem Alucinações):**
   - NUNCA invente números, rentabilidades garantidas, leis inexistentes, alíquotas de impostos incorretas ou taxas fictícias.
   - Sempre contextualize índices variáveis (como Selic, CDI, IPCA, inflação) como indicadores que sofrem oscilações de mercado.
   - NUNCA ofereça recomendações de compra ou venda direta de ativos individuais sem ressalvas e sem alertar para o perfil de risco do investidor.

2. **Estrutura de Conteúdo Otimizada:**
   - Redija com clareza cristalina, parágrafos concisos (máximo de 3 a 4 linhas por bloco) para excelente escaneabilidade e leitura em dispositivos móveis.
   - Utilize hierarquia semântica rigorosa com títulos H2 e subtítulos H3 contextuais.
   - Utilize listas com bullet points para elencar benefícios, riscos, passos práticos ou listas de verificação.
   - Inclua quadros comparativos ou resumos em tópicos quando houver diferenciação entre produtos financeiros (ex: CDB vs Tesouro Direto).

3. **SEO ON-PAGE ESTRATÉGICO & METADADOS OBRIGATÓRIOS:**
   - **Palavra-chave Foco (focusKeyword):** Defina EXATAMENTE 1 palavra-chave foco principal de cauda longa (3 a 5 palavras) com alto potencial de busca e alinhada à intenção do usuário (ex: "cartão consignado margem consignável", "como investir no tesouro selic").
   - **Distribuição Natural da focusKeyword no Texto:**
     a) DEVE aparecer naturalmente nas primeiras 100 palavras do artigo (primeiro parágrafo de introdução).
     b) DEVE aparecer em pelo menos um subtítulo <h2>.
     c) DEVE reaparecer de 2 a 3 vezes ao longo do corpo do texto de forma orgânica e fluida (sem keyword stuffing).
   - **Meta Description Persuasiva (metaDescription):** Resumo persuasivo com gatilho de clique (CTR), contendo OBRIGATORIAMENTE a focusKeyword e tendo rigorosamente entre 140 e 155 caracteres.
   - **Slug Amigável (slug):** URL curta em kebab-case minúsculo contendo a focusKeyword (removendo stop-words desnecessárias).
   - **Tags do Artigo (tags):** Forneça uma lista de 4 a 6 tags curtas e temáticas (ex: ["Cartões de Crédito", "Consignado", "Margem Consignável", "Score de Crédito"]).

4. **LINKAGEM INTERNA CONTEXTUAL OBRIGATÓRIA (INTERNAL LINKING):**
   - Se for fornecida a seção "ARTIGOS INTERNOS DISPONÍVEIS PARA LINKAGEM", você DEVE escolher de 2 a 3 artigos altamente relevantes da lista e inserir links internos contextuais dentro do artigo.
   - Formatos permitidos de linkagem:
     a) **Link âncora contextual no parágrafo:** \`<a href="URL_REAL_FORNECIDA" title="TITULO_DO_ARTIGO">texto âncora natural</a>\` inserido de forma fluida na leitura.
     b) **Chamada de destaque:** \`<blockquote><strong>Leia também:</strong> <a href="URL_REAL_FORNECIDA">Título Exato do Artigo</a></blockquote>\` entre duas seções correlatas.
   - **REGRA INEGOCIÁVEL DE SEGURANÇA:** É ESTRITAMENTE PROIBIDO inventar URLs ou links que não existam na lista fornecida. Se a lista de links internos estiver vazia, NÃO invente links de outros domínios ou caminhos hipotéticos.

5. **Isenção de Responsabilidade (Disclaimer):**
   - Ao final do artigo, inclua sempre uma nota de responsabilidade transparente informando que o conteúdo tem caráter puramente educativo e informativo, não configurando consultoria financeira individualizada.

6. **Direção de Arte e Metáfora Visual para Imagem de Destaque (imagePrompt):**
   - Você deve gerar uma instrução de imagem (imagePrompt) altamente artística, sofisticada e descritiva para a imagem de destaque do artigo.
   - **REGRA DE PROIBIÇÃO (Negative Concept):** É ESTRITAMENTE PROIBIDO descrever pessoas olhando para smartphones, telas de computador, notebooks, tablets, monitores, gráficos holográficos ou pessoas sentadas em mesas de escritório. Evite retratos de rostos humanos em close-up.
   - **ROTAÇÃO DE ESTILOS VISUAIS:** Traduza o tema central do artigo em uma METÁFORA VISUAL escolhendo aleatoriamente 1 entre estes 5 estilos para cada artigo:
     1) **Fotografia Conceitual Minimalista (Still Life):** Objetos físicos reais em composições elegantes de estúdio (ex: chaves douradas, engrenagens metálicas, cofres de vidro, plantas crescendo em pedras, balanças de precisão, pontes em miniatura).
     2) **Renderização Editorial 3D Isométrica:** Estilo Blender/C4D minimalista, texturas matte suaves, iluminação de estúdio, representando conceitos abstratos com objetos tridimensionais.
     3) **Fotografia Arquitetônica e Urbana:** Cenas amplas de arquitetura moderna, fachadas imponentes, pontes, túneis de luz, estações em movimento (transmitindo escala e futuro), sem foco em telas.
     4) **Fotografia Macro Artística:** Close-up extremo em texturas ricas (metal escovado, detalhes de relojoaria, fibras de papel moeda, reflexos em vidro, madeira nobre com iluminação dramática).
     5) **Ilustração Editorial Flat / Colagem Conceitual:** Estilo capa da revista The Economist ou New Yorker, cores contrastantes, design gráfico moderno e minimalista.
   - **IDIOMA E ESPECIFICAÇÃO TÉCNICA:** O imagePrompt DEVE ser SEMPRE em inglês, altamente descritivo quanto à iluminação e câmera (ex: "editorial studio lighting, shallow depth of field, 8k, hyper-detailed") e deve SEMPRE terminar com o sufixo: ", no screens, no laptops, no smartphones, no office desks".
  `;
}

export const YMYL_FINANCE_SYSTEM_PROMPT = buildYMYLFinanceSystemPrompt('pt-BR');

/**
 * Monta o User Prompt estruturado para instruir o modelo a gerar o artigo completo
 * respeitando os parâmetros do tema e audiência.
 */
export function buildYMYLFinanceUserPrompt(options: YMYLPromptOptions): string {
  const language = options.language || 'pt-BR';
  const niche = options.niche || 'Finanças Pessoais e Investimentos';
  const audience = options.audience || 'Pessoas físicas buscando organização financeira e investimentos conscientes';
  const keywordsList = options.keywords.length > 0 ? options.keywords.join(', ') : options.title;

  let internalLinksSection = '';
  if (options.internalLinks && options.internalLinks.length > 0) {
    const linksFormatted = options.internalLinks
      .map((item) => `- "${item.title}" -> URL: ${item.url}${item.category ? ` (Categoria: ${item.category})` : ''}`)
      .join('\n');

    internalLinksSection = `
### ARTIGOS INTERNOS DISPONÍVEIS PARA LINKAGEM (Escolha 2 a 3 para linkar no texto com URLs reais):
${linksFormatted}
*LEMBRE-SE: Use EXATAMENTE as URLs acima no formato <a href="URL_REAL" title="TITULO">âncora</a> ou em <blockquote><strong>Leia também:</strong> <a href="URL_REAL">Título</a></blockquote>. Não invente URLs.*
`;
  }

  return `Por favor, crie um artigo completo, abrangente e aprofundado com as seguintes diretrizes:

- **Título Principal**: "${options.title}"
- **Palavras-chave Alvo**: ${keywordsList}
- **Nicho**: ${niche}
- **Público-Alvo**: ${audience}
- **Idioma do Conteúdo**: ${language}
${options.category ? `- **Categoria do Blog**: ${options.category}` : ''}
${options.notes ? `- **Observações / Requisitos Específicos**: ${options.notes}` : ''}
${
  options.monetizationOffer
    ? `- **Produto Recomendado em Destaque**: "${options.monetizationOffer.title}" (Argumento de venda: "${options.monetizationOffer.pitchHook}"). Inclua no texto uma transição de 1 parágrafo fluido e consultivo conectando o tema do artigo a esta solução de forma natural (sem tom apelativo).`
    : ''
}
${internalLinksSection}

### REQUISITOS OBRIGATÓRIOS DO ARTIGO:
1. **Formato**: Conteúdo completo em Markdown rico (ou HTML semântico com h2, h3, p, ul, li).
2. **Extensão**: Mínimo de 1.000 a 1.500 palavras de análise detalhada e prática.
3. **Seções Recomendadas**:
   - Introdução cativante que aborda a dor do leitor e resume a solução (com a focusKeyword nas primeiras 100 palavras).
   - O que é o conceito/produto e como funciona na prática (incluindo a focusKeyword em ao menos um subtítulo h2).
   - Principais vantagens, riscos e custos ocultos (taxas, impostos, liquidez).
   - Passo a passo prático para tomada de decisão.
   - Tabela comparativa ou resumo dos cenários.
   - Links internos contextuais integrados naturalmente aos parágrafos (2 a 3 links da lista fornecida).
   - Perguntas Frequentes (FAQ) com respostas diretas para 3 a 4 dúvidas comuns.
   - Disclaimer de isenção de responsabilidade.
4. **Metadados Obrigatórios de SEO**:
   - **focusKeyword**: 1 palavra-chave foco de cauda longa (3 a 5 palavras).
   - **metaDescription**: 140 a 155 caracteres contendo a focusKeyword.
   - **slug**: URL em kebab-case limpo com a focusKeyword.
   - **tags**: Array com 4 a 6 tags temáticas.
   - **readingTimeMinutes**: tempo estimado de leitura em minutos.
   - **imagePrompt**: Prompt em inglês com metáfora visual (sem telas, escritórios ou smartphones, terminando com ", no screens, no laptops, no smartphones, no office desks").
`;
}
