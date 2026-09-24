import { LegacyAIProvider } from './legacy-provider.interface';
import { LegacyMockAIProvider } from './mock-provider';

let legacyProvider: LegacyAIProvider = new LegacyMockAIProvider();

export function getAIProvider(): LegacyAIProvider {
  return legacyProvider;
}

export function registerAIProvider(provider: LegacyAIProvider): void {
  legacyProvider = provider;
}

// Fase 02: Novas abstrações oficiais e providers
export * from './ai-provider.interface';
export * from './image-provider.interface';
export * from './gemini-provider';
export * from './pollinations-image-provider';
export * from './openai-image-provider';
export * from './fallback-image-provider';
export * from './nano-banana-provider';
export * from './mock-ai-provider';
export * from './deepseek-provider';
export * from './factory';
export * from './legacy-provider.interface';

