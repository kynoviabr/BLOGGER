export interface ContentIdea {
  title: string;
  keywords: string;
  description: string;
  type: string;
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
