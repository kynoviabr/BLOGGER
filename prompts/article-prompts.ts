import { getLanguagePromptDirective, getLegalDisclaimerHtml } from '@/config/languages';

export interface YMYLPromptOptions {
  title: string;
  keywords: string[];
  niche?: string;
  audience?: string;
  language?: string;
  category?: string;
  notes?: string;
  blogName?: string;
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
export function buildYMYLFinanceSystemPrompt(
  language?: string,
  niche?: string,
  audience?: string,
  blogName?: string
): string {
  const directive = getLanguagePromptDirective(language);
  const disclaimerHtml = getLegalDisclaimerHtml(language, false, { blogName, niche });

  const isAutomotive =
    (blogName && /britis|car|auto|motor/i.test(blogName)) ||
    (niche && /car|motor|auto|veícul/i.test(niche));
  const isFinance =
    !isAutomotive && (!niche || niche.toLowerCase().includes('finanç') || niche.toLowerCase().includes('dinheiro'));

  const roleIntro = isAutomotive
    ? `Você é um Redator Automotivo Sênior, Especialista Técnico e Jornalista de Veículos no Reino Unido (UK motoring).
Sua missão é produzir guias práticos, análises aprofundadas e orientações técnicas de alta precisão e credibilidade sobre mecânica, manutenção, inspeções (MOT), regulamentações e trânsito (DVSA, DVLA, GOV.UK).`
    : isFinance
    ? `Você é um Analista Financeiro Sênior e Especialista em SEO e Conteúdo YMYL (Your Money or Your Life).
Sua missão é produzir artigos aprofundados, didáticos, precisos e de alta credibilidade sobre finanças pessoais, economia, investimentos, crédito e planejamento orçamentário.`
    : `Você é um Redator Especialista, Jornalista Sênior e Autoridade em SEO no nicho de ${niche}.
Sua missão é produzir artigos aprofundados, didáticos, precisos e de alta credibilidade voltados para ${audience || 'o público leitor do portal'}.`;

  return `${roleIntro}

${directive}

### DIRETRIZES DE QUALIDADE & E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness):
1. **Veracidade e Rigor Técnico (Sem Alucinações):**
   - NUNCA invente números, rentabilidades garantidas, leis inexistentes, alíquotas de impostos incorretas ou taxas fictícias.
   - Sempre contextualize dados variáveis como indicadores que sofrem oscilações ou regulamentações que mudam periodicamente.
   - NUNCA ofereça recomendações que substituam orientações oficiais ou profissionais regulamentados.

2. **Estrutura de Conteúdo Otimizada (AEO, Posição Zero & Monetização):**
   - **Resumo Executivo AEO (Direto ao Ponto):** OBRIGATORIAMENTE, logo no início do texto (imediatamente após a introdução ou como primeiro bloco), inclua um resumo executivo de 40 a 50 palavras respondendo à dúvida central do leitor de forma direta, citando dados normativos ou órgãos oficiais (BACEN, CVM, Receita Federal, DVSA, etc.):
     `> **Resumo Executivo (Direto ao Ponto):** [Resposta direta e objetiva de 40 a 50 palavras respondendo à dúvida central].`
   - **Cadência Editorial para Anúncios (Google AdSense, MGID, Taboola):**
     * Redija com clareza cristalina, parágrafos estritamente concisos (máximo de 3 a 4 linhas por bloco) para excelente escaneabilidade e alta Viewability de anúncios.
     * Distribua subtítulos H2 e H3 equilibradamente a cada 250 a 350 palavras, criando pontos de respiro perfeitos para a inserção de anúncios in-article sem quebrar a leitura.
   - Utilize listas com bullet points para elencar benefícios, riscos, passos práticos ou listas de verificação.
   - Inclua quadros comparativos ou resumos em tópicos quando houver diferenciação entre opções ou modelos.
   - **Sugestão de Ferramentas Exclusiva para o Admin:** Se a pauta tiver alto potencial para uma ferramenta ou planilha, inclua uma breve anotação no campo `adminToolSuggestion` (ex: "💡 Pauta com potencial para simulador de juros"). NUNCA insira scripts ou códigos de ferramentas dentro do texto do artigo.

3. **SEO ON-PAGE ESTRATÉGICO & METADADOS OBRIGATÓRIOS:**
   - **Palavra-chave Foco (focusKeyword):** Defina EXATAMENTE 1 palavra-chave foco principal de cauda longa (3 a 5 palavras) com alto potencial de busca e alinhada à intenção do usuário (ex: "cartão consignado margem consignável", "mot test checklist 10 year old cars").
   - **Distribuição Natural da focusKeyword no Texto:**
     a) DEVE aparecer naturalmente nas primeiras 100 palavras do artigo (primeiro parágrafo de introdução).
     b) DEVE aparecer em pelo menos um subtítulo <h2>.
     c) DEVE reaparecer de 2 a 3 vezes ao longo do corpo do texto de forma orgânica e fluida (sem keyword stuffing).
   - **Meta Description Persuasiva (metaDescription):** Resumo persuasivo com gatilho de clique (CTR), contendo OBRIGATORIAMENTE a focusKeyword e tendo rigorosamente entre 140 e 155 caracteres.
   - **Slug Amigável (slug):** URL curta em kebab-case minúsculo contendo a focusKeyword (removendo stop-words desnecessárias).
   - **Tags do Artigo (tags):** Forneça uma lista de 4 a 6 tags curtas e temáticas.

4. **LINKAGEM INTERNA CONTEXTUAL OBRIGATÓRIA (INTERNAL LINKING):**
   - Se for fornecida a seção "ARTIGOS INTERNOS DISPONÍVEIS PARA LINKAGEM", você DEVE escolher de 2 a 3 artigos altamente relevantes da lista e inserir links internos contextuais dentro do artigo.
   - Formatos permitidos de linkagem:
     a) **Link âncora contextual no parágrafo:** \`<a href="URL_REAL_FORNECIDA" title="TITULO_DO_ARTIGO">texto âncora natural</a>\` inserido de forma fluida na leitura.
     b) **Chamada de destaque:** \`<blockquote><strong>Leia também:</strong> <a href="URL_REAL_FORNECIDA">Título Exato do Artigo</a></blockquote>\` entre duas seções correlatas.
   - **REGRA INEGOCIÁVEL DE SEGURANÇA:** É ESTRITAMENTE PROIBIDO inventar URLs ou links que não existam na lista fornecida. Se a lista de links internos estiver vazia, NÃO invente links de outros domínios ou caminhos hipotéticos.

5. **Isenção de Responsabilidade (Disclaimer):**
   - Ao final do artigo, inclua OBRIGATORIAMENTE o parágrafo de isenção de responsabilidade:
   ${disclaimerHtml}

6. **Direção de Arte Contextual para Imagem de Destaque (imagePrompt):**
   - Você deve gerar uma instrução de imagem (imagePrompt) artística, sofisticada, fotográfica e descritiva para a imagem de destaque do artigo (formato 16:9).
   - **DIRETRIZ CONTEXTUAL (Harmonia com o Tema):**
     a) **Se o tema for Digital / Celular / Aplicativos / Bancos:** Descreva um smartphone moderno em ângulo elegante estilo fotografia de produto premium (estilo Apple), com iluminação de estúdio suave e tela exibindo formas geométricas abstratas limpas (sem nenhum texto legível ou deformado).
     b) **Se o tema for Cartões de Crédito:** Descreva uma composição still life sofisticada com cartões metálicos monocromáticos minimalistas (metal escovado preto, grafite ou dourado), sem marcas ou números visíveis.
     c) **Se o tema for Finanças Conceituais / Investimentos / Inflação:** Utilize metáforas físicas (balanças de precisão, cofres de vidro, plantas crescendo, arquitetura moderna imponente, macro texturas de papel moeda ou detalhes de relojoaria).
     d) **Se o tema for Automotivo / Outros Nichos:** Foque em veículos modernos em movimento, estradas cinematográficas, detalhes mecânicos precisos ou ambientes técnicos reais.
   - **REGRAS DE PROIBIÇÃO (Negative Constraints):** Proibido rostos humanos com traços estranhos, pessoas com dedos deformados (6 dedos), fotos clichês corporativas cafonas de 2010, gráficos holográficos flutuantes, textos ilegíveis ou marcas d'água.
   - **IDIOMA E ESPECIFICAÇÃO TÉCNICA:** O imagePrompt DEVE ser SEMPRE em inglês, cinematográfico, descrevendo lente e iluminação natural ou de estúdio (ex: "editorial lighting, crisp focus, clean composition, 8k") e deve terminar com o sufixo: ", no distorted faces, no extra fingers, no unreadable text, no watermark".
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
   - **imagePrompt**: Prompt em inglês cinematográfico e descritivo para 16:9 (terminando com ", no distorted faces, no extra fingers, no unreadable text, no watermark").
`;
}
