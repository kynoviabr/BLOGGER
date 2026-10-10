export interface ContentIdea {
  title: string;
  keywords: string;
  description: string;
  type: string;
  category?: string;
}

export interface GenerateIdeasRequest {
  blogId: string;
  category?: string;
  count?: number;
}

export interface GenerateIdeasResponse {
  success: boolean;
  ideas?: ContentIdea[];
  error?: string;
}

export interface ExistingIdeaSummary {
  title: string;
  keywords?: string;
  type?: string;
}

export interface GenerateOneIdeaRequest {
  blogId: string;
  category?: string;
  existingIdeas?: ExistingIdeaSummary[];
  queuePosition?: number;
  totalRequested?: number;
}

export interface GenerateOneIdeaResponse {
  success: boolean;
  idea?: ContentIdea;
  error?: string;
  queuePosition?: number;
  durationMs?: number;
}

export interface SaveIdeasBatchRequest {
  blogId: string;
  category?: string;
  ideas: ContentIdea[];
}

export interface SaveIdeasBatchResponse {
  success: boolean;
  count?: number;
  error?: string;
}

