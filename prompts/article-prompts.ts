export interface YMYLPromptOptions {
  title: string;
  keywords: string[];
  niche?: string;
  audience?: string;
  language?: string;
  category?: string;
  notes?: string;
}

/**
 * System Prompt com foco rigoroso em Your Money or Your Life (YMYL) no nicho financeiro.
 * Instruções orientadas a autoridade técnica (E-E-A-T), prevenção absoluta de alucinações,
 * estrutura semântica enriquecida e conformidade com diretrizes regulatórias e de SEO.
 */
export const YMYL_FINANCE_SYSTEM_PROMPT = `Você é um Analista Financeiro Sênior e Especialista em SEO e Conteúdo YMYL (Your Money or Your Life).
Sua missão é produzir artigos aprofundados, didáticos, precisos e de alta credibilidade sobre finanças pessoais, economia, investimentos, crédito e planejamento orçamentário.

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

3. **SEO Estratégico:**
   - Insira a palavra-chave primária de forma natural no início do texto (primeiros 100 caracteres) e em ao menos um subtítulo H2.
   - Trabalhe variações semânticas (palavras-chave secundárias LSI) ao longo dos parágrafos sem keyword stuffing.
   - Redija uma meta description convincente (máximo 155 caracteres) com gatilho de clique (CTR) e intenção de busca atendida.
   - Forneça uma sugestão de slug URL limpa, amigável e em letras minúsculas separadas por hífen.

4. **Isenção de Responsabilidade (Disclaimer):**
   - Ao final do artigo, inclua sempre uma nota de responsabilidade transparente informando que o conteúdo tem caráter puramente educativo e informativo, não configurando consultoria financeira individualizada.
`;

/**
 * Monta o User Prompt estruturado para instruir o modelo a gerar o artigo completo
 * respeitando os parâmetros do tema e audiência.
 */
export function buildYMYLFinanceUserPrompt(options: YMYLPromptOptions): string {
  const language = options.language || 'pt-BR';
  const niche = options.niche || 'Finanças Pessoais e Investimentos';
  const audience = options.audience || 'Pessoas físicas buscando organização financeira e investimentos conscientes';
  const keywordsList = options.keywords.length > 0 ? options.keywords.join(', ') : options.title;

  return `Por favor, crie um artigo completo, abrangente e aprofundado com as seguintes diretrizes:

- **Título Principal**: "${options.title}"
- **Palavras-chave Alvo**: ${keywordsList}
- **Nicho**: ${niche}
- **Público-Alvo**: ${audience}
- **Idioma do Conteúdo**: ${language}
${options.category ? `- **Categoria do Blog**: ${options.category}` : ''}
${options.notes ? `- **Observações / Requisitos Específicos**: ${options.notes}` : ''}

### REQUISITOS OBRIGATÓRIOS DO ARTIGO:
1. **Formato**: Conteúdo completo em Markdown limpo (ou HTML semântico com h2, h3, p, ul, li).
2. **Extensão**: Mínimo de 1.000 a 1.500 palavras de análise detalhada e prática.
3. **Seções Recomendadas**:
   - Introdução cativante que aborda a dor do leitor e resume a solução.
   - O que é o conceito/produto e como funciona na prática.
   - Principais vantagens, riscos e custos ocultos (taxas, impostos, liquidez).
   - Passo a passo prático para tomada de decisão.
   - Tabela comparativa ou resumo dos cenários.
   - Perguntas Frequentes (FAQ) com respostas diretas para 3 a 4 dúvidas comuns.
   - Disclaimer de isenção de responsabilidade.
4. **Metadados**: Retorne também o título final polido, slug otimizado, meta description (120-155 caracteres) e tempo estimado de leitura em minutos.
`;
}
