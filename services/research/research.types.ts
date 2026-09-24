export type ResearchRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type SourceType = 'official' | 'institutional' | 'news' | 'secondary';

export interface ResearchRequest {
  title: string;
  category?: string;
  keywords?: string[];
  niche?: string;
  currentDate: string;
  language?: 'pt-BR';
  contentId?: string;
}

export interface ResearchSource {
  title: string;
  url: string;
  domain: string;
  publisher?: string;
  publishedAt?: string;
  accessedAt: string;
  sourceType: SourceType;
  tier: 1 | 2 | 3 | 4;
  selectionReason: string;
}

export interface ResearchFact {
  statement: string;
  sourceUrl: string;
  sourceTitle: string;
  publishedAt?: string;
  confidence: 'high' | 'medium';
}

export interface FactualResearchBrief {
  topic: string;
  riskLevel: ResearchRiskLevel;
  researchedAt: string;
  sources: ResearchSource[];
  facts: ResearchFact[];
  uncertainties: string[];
  warnings: string[];
  status: 'READY' | 'RESEARCH_REVIEW_REQUIRED';
  rawBriefingText: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, options?: { limit?: number; language?: string }): Promise<WebSearchResult[]>;
}
