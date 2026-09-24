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

export interface FetchedSourceContent {
  sourceUrl: string;
  finalUrl: string;
  httpStatus: number;
  contentType: string;
  byteLength: number;
  title: string;
  publishedAt?: string;
  accessedAt: string;
  cleanedText: string;
  paragraphs: string[];
  isOfficial: boolean;
  dnsValidated: boolean;
  redirectCount: number;
}

export interface ResearchFact {
  statement: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceExcerpt: string; // Trecho literal de evidência da página original
  publishedAt?: string;
  accessedAt: string;
  confidence: 'high' | 'medium';
  verificationMethod: 'source_content'; // Proibido o uso de 'search_snippet'
}

export interface FactualResearchBrief {
  topic: string;
  riskLevel: ResearchRiskLevel;
  researchedAt: string;
  sources: ResearchSource[];
  fetchedSources: FetchedSourceContent[];
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

export type FactualAuditStatus = 'SUPPORTED' | 'UNSUPPORTED' | 'CONTRADICTED';

export interface FactualAuditClaim {
  claim: string;
  sourceFact: string;
  sourceExcerpt: string;
  sourceUrl: string;
  status: FactualAuditStatus;
  justification: string;
}

export interface FactualAuditReport {
  claims: FactualAuditClaim[];
  allSupported: boolean;
  contradictedCount: number;
  unsupportedCount: number;
  status: 'PASS' | 'REVIEW_REQUIRED' | 'FAIL';
}
