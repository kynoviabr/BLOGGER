export interface AIOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemInstruction?: string;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

export interface AITextOptions extends AIOptions {
  tone?: string;
}

export interface AITextResult {
  text: string;
  model: string;
  provider: string;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd?: number;
  };
}

export interface AIImageOptions {
  aspectRatio?: '1:1' | '16:9' | '4:3' | '9:16';
  negativePrompt?: string;
  style?: string;
  seed?: number;
  model?: string;
}

export interface AIImageResult {
  imageUrl?: string;
  storagePath?: string;
  base64Data?: string;
  altText?: string;
  prompt: string;
  provider: string;
}

export interface AIVideoOptions {
  durationSeconds?: number;
  aspectRatio?: '16:9' | '9:16';
  resolution?: '720p' | '1080p';
  model?: string;
}

export interface AIVideoResult {
  videoUrl?: string;
  storagePath?: string;
  durationSeconds: number;
  provider: string;
}
