import { AIProvider } from './provider.interface';
import { MockAIProvider } from './mock-provider';

// Provedor instanciado para o MVP da Foundation
// Na próxima fase, GeminiProvider / ImagenProvider serão plugados aqui
let currentProvider: AIProvider = new MockAIProvider();

export function getAIProvider(): AIProvider {
  return currentProvider;
}

export function registerAIProvider(provider: AIProvider): void {
  currentProvider = provider;
}

export * from './provider.interface';
export * from './mock-provider';
