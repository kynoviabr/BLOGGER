/**
 * Testes isolados para OpenAIImageProvider, ImageOptimizer, FallbackImageProvider e Factory.
 * Executa todas as asserções de robustez sem fazer chamadas desnecessárias ou degradar produção.
 */

import { OpenAIImageProvider } from '../services/ai/openai-image-provider';
import { PollinationsImageProvider } from '../services/ai/pollinations-image-provider';
import { FallbackImageProvider } from '../services/ai/fallback-image-provider';
import { createImageProvider } from '../services/ai/factory';
import { ImageOptimizer } from '../lib/image-optimizer';
import { ImageProvider, GeneratedImage } from '../services/ai/image-provider.interface';
import { ImageProviderError } from '../lib/errors/ai.errors';
import fs from 'fs';
import path from 'path';

// Helper de asserção
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('==================================================');
  console.log('INICIANDO BATERIA DE TESTES ISOLADOS');
  console.log('==================================================\n');

  // --------------------------------------------------------------------------
  // 1. ImageOptimizer: Otimização WebP e Fallback Gracioso
  // --------------------------------------------------------------------------
  console.log('1. TESTE: ImageOptimizer');
  const sampleImagePath = '/tmp/blogger-openai-test-2.png';
  let sampleBuffer: Buffer;

  if (fs.existsSync(sampleImagePath)) {
    sampleBuffer = fs.readFileSync(sampleImagePath);
  } else {
    // Cria buffer PNG 1x1 mínimo se o arquivo temporário não estiver disponível
    sampleBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
  }

  const optResult = await ImageOptimizer.optimize(sampleBuffer, 'image/png', {
    format: 'jpeg',
    quality: 85,
  });

  assert(optResult.mimeType === 'image/jpeg', 'Formato de saída deve ser image/jpeg');
  assert(optResult.buffer.length > 0, 'Buffer otimizado deve ter tamanho > 0');
  assert(optResult.optimizedBytes === optResult.buffer.length, 'optimizedBytes corresponde ao tamanho do buffer');
  assert(
    optResult.buffer[0] === 0xFF && optResult.buffer[1] === 0xD8 && optResult.buffer[2] === 0xFF,
    'Magic bytes de JPEG validados (FF D8 FF)'
  );
  console.log(`  ℹ Redução obtida: ${optResult.reductionPercentage}% (${optResult.originalBytes} -> ${optResult.optimizedBytes} bytes)`);

  // Teste de fallback do optimizer com buffer corrompido
  const brokenBuffer = Buffer.from('not an image at all');
  const fallbackOpt = await ImageOptimizer.optimize(brokenBuffer, 'application/octet-stream');
  assert(fallbackOpt.buffer.equals(brokenBuffer), 'Optimizer deve retornar buffer original intacto em caso de falha');
  assert(fallbackOpt.reductionPercentage === 0, 'Redução deve ser 0% no fallback do optimizer');

  // --------------------------------------------------------------------------
  // 2. Validação de Magic Bytes e Rejeição
  // --------------------------------------------------------------------------
  console.log('\n2. TESTE: Magic Bytes (Validação e Rejeição)');
  const provider = new OpenAIImageProvider({ apiKey: 'test-key' });
  const detectMime = (provider as any).detectImageMimeType.bind(provider);

  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  assert(detectMime(pngHeader) === 'image/png', 'Detecta PNG corretamente');

  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert(detectMime(jpegHeader) === 'image/jpeg', 'Detecta JPEG corretamente');

  const webpHeader = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii'),
  ]);
  assert(detectMime(webpHeader) === 'image/webp', 'Detecta WEBP corretamente');

  const htmlCorrupt = Buffer.from('<html><body>502 Bad Gateway</body></html>');
  assert(detectMime(htmlCorrupt) === null, 'Rejeita HTML de erro');
  assert(detectMime(Buffer.from('short')) === null, 'Rejeita buffer menor que 12 bytes');

  // --------------------------------------------------------------------------
  // 3. Simulação de Retries: 429, 500, Timeout e Não-Retry de 401/400
  // --------------------------------------------------------------------------
  console.log('\n3. TESTE: Retries e Tratamento de Erros HTTP');
  const originalFetch = global.fetch;

  // 3.1. 429 com sucesso na 3ª tentativa
  let attempts429 = 0;
  global.fetch = async () => {
    attempts429++;
    if (attempts429 < 3) {
      return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // 3ª tentativa retorna imagem válida em base64
    const validB64 = sampleBuffer.toString('base64');
    return new Response(
      JSON.stringify({ data: [{ b64_json: validB64 }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const retryProvider429 = new OpenAIImageProvider({
    apiKey: 'sk-test',
    maxRetries: 2,
    timeoutMs: 5000,
  });
  const res429 = await retryProvider429.generateFeaturedImage('Test prompt 429');
  assert(attempts429 === 3, '429 deve acionar retry e completar na 3ª tentativa');
  assert(res429.mimeType === 'image/jpeg', 'Resultado final após retry é imagem JPEG válida');

  // 3.2. 500 falhando em todas as tentativas (3 tentativas)
  let attempts500 = 0;
  global.fetch = async () => {
    attempts500++;
    return new Response(JSON.stringify({ error: { message: 'Internal Server Error' } }), {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const retryProvider500 = new OpenAIImageProvider({
    apiKey: 'sk-test',
    maxRetries: 2,
    timeoutMs: 5000,
  });
  let threw500 = false;
  try {
    await retryProvider500.generateFeaturedImage('Test prompt 500');
  } catch (err) {
    threw500 = true;
    assert(err instanceof ImageProviderError, 'Erro gerado é instância de ImageProviderError');
    assert((err as ImageProviderError).statusCode === 500, 'StatusCode do erro é 500');
  }
  assert(threw500, '500 persistente deve lançar erro');
  assert(attempts500 === 3, '500 deve tentar exatamente 3 vezes (1 inicial + 2 retries)');

  // 3.3. Timeout (AbortError) com retry
  let attemptsTimeout = 0;
  global.fetch = async () => {
    attemptsTimeout++;
    if (attemptsTimeout < 2) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
    const validB64 = sampleBuffer.toString('base64');
    return new Response(
      JSON.stringify({ data: [{ b64_json: validB64 }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const retryProviderTimeout = new OpenAIImageProvider({
    apiKey: 'sk-test',
    maxRetries: 2,
    timeoutMs: 5000,
  });
  const resTimeout = await retryProviderTimeout.generateFeaturedImage('Test prompt timeout');
  assert(attemptsTimeout === 2, 'Timeout deve realizar retry e suceder na próxima tentativa');
  assert(resTimeout.buffer !== undefined, 'Retornou buffer após timeout recuperado');

  // 3.4. 401 Unauthorized NÃO deve sofrer retry
  let attempts401 = 0;
  global.fetch = async () => {
    attempts401++;
    return new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const noRetry401 = new OpenAIImageProvider({
    apiKey: 'sk-invalid',
    maxRetries: 2,
  });
  let threw401 = false;
  try {
    await noRetry401.generateFeaturedImage('Test prompt 401');
  } catch (err) {
    threw401 = true;
    assert(err instanceof ImageProviderError, '401 lança ImageProviderError');
    assert(!(err as ImageProviderError).isRetryable, '401 isRetryable deve ser false');
  }
  assert(threw401, '401 deve lançar erro imediatamente');
  assert(attempts401 === 1, '401 NÃO deve sofrer retry (exatamente 1 tentativa)');

  // Restaura fetch
  global.fetch = originalFetch;

  // --------------------------------------------------------------------------
  // 4. Teste de Fallback entre Providers
  // --------------------------------------------------------------------------
  console.log('\n4. TESTE: FallbackImageProvider (OpenAI -> Pollinations)');

  // Mock do primário com falha
  const mockPrimaryFailing: ImageProvider = {
    name: 'OpenAIImageProvider',
    generateFeaturedImage: async () => {
      throw new ImageProviderError('Simulated primary failure', {
        provider: 'OpenAIImageProvider',
        statusCode: 500,
      });
    },
  };

  // Mock do fallback com sucesso
  let fallbackInvoked = false;
  const mockFallbackSuccess: ImageProvider = {
    name: 'PollinationsImageProvider',
    generateFeaturedImage: async () => {
      fallbackInvoked = true;
      return {
        imageUrl: 'https://image.pollinations.ai/mock',
        buffer: Buffer.from('mock-webp'),
        mimeType: 'image/webp',
        altText: 'Fallback image',
        provider: 'PollinationsImageProvider',
      };
    },
  };

  const fallbackProvider = new FallbackImageProvider(mockPrimaryFailing, mockFallbackSuccess);
  const fallbackResult = await fallbackProvider.generateFeaturedImage('Test fallback');

  assert(fallbackInvoked, 'Fallback deve ser invocado quando primary falha');
  assert(fallbackResult.provider === 'PollinationsImageProvider', 'Resultado reflete provider de fallback');

  // Teste primário com sucesso (fallback NÃO deve ser chamado)
  let fallbackInvokedOnSuccess = false;
  const mockPrimarySuccess: ImageProvider = {
    name: 'OpenAIImageProvider',
    generateFeaturedImage: async () => ({
      imageUrl: 'https://openai.mock/image.png',
      buffer: Buffer.from('openai-webp'),
      mimeType: 'image/webp',
      altText: 'OpenAI image',
      provider: 'OpenAIImageProvider',
    }),
  };
  const mockFallbackUnused: ImageProvider = {
    name: 'PollinationsImageProvider',
    generateFeaturedImage: async () => {
      fallbackInvokedOnSuccess = true;
      throw new Error('Should not be called');
    },
  };
  const successProvider = new FallbackImageProvider(mockPrimarySuccess, mockFallbackUnused);
  const successResult = await successProvider.generateFeaturedImage('Test primary success');
  assert(!fallbackInvokedOnSuccess, 'Fallback NÃO deve ser chamado se primário suceder');
  assert(successResult.provider === 'OpenAIImageProvider', 'Resultado reflete primário');

  // --------------------------------------------------------------------------
  // 5. Teste da Factory (createImageProvider)
  // --------------------------------------------------------------------------
  console.log('\n5. TESTE: Factory (createImageProvider)');

  // 5.1. IMAGE_PROVIDER=openai com chave presente
  const factoryOpenAI = createImageProvider({
    imageProvider: 'openai',
    openaiApiKey: 'sk-test-valid',
  });
  assert(factoryOpenAI instanceof FallbackImageProvider, 'Factory openai retorna FallbackImageProvider');
  assert((factoryOpenAI as FallbackImageProvider).primary instanceof OpenAIImageProvider, 'Primário é OpenAIImageProvider');
  assert((factoryOpenAI as FallbackImageProvider).fallback instanceof PollinationsImageProvider, 'Secundário é PollinationsImageProvider');

  // 5.2. IMAGE_PROVIDER=openai SEM chave -> Erro 401 explícito
  let threwMissingKey = false;
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    createImageProvider({ imageProvider: 'openai', openaiApiKey: undefined });
  } catch (err) {
    threwMissingKey = true;
    assert(err instanceof ImageProviderError, 'Erro é ImageProviderError');
    assert((err as ImageProviderError).statusCode === 401, 'Erro tem statusCode 401');
  }
  if (oldKey) process.env.OPENAI_API_KEY = oldKey;
  assert(threwMissingKey, 'Factory deve lançar erro explícito se IMAGE_PROVIDER=openai sem chave');

  // 5.3. IMAGE_PROVIDER=pollinations
  const factoryPollinations = createImageProvider({ imageProvider: 'pollinations' });
  assert(factoryPollinations instanceof PollinationsImageProvider, 'Factory pollinations retorna PollinationsImageProvider');

  // 5.4. Default sem chave e sem provider definido -> Pollinations seguro
  delete process.env.OPENAI_API_KEY;
  delete process.env.IMAGE_PROVIDER;
  const factoryDefaultSafe = createImageProvider({});
  assert(factoryDefaultSafe instanceof PollinationsImageProvider, 'Sem chave e sem provider -> default seguro Pollinations');
  if (oldKey) process.env.OPENAI_API_KEY = oldKey;

  // 5.5. Provedor desconhecido
  let threwUnknown = false;
  try {
    createImageProvider({ imageProvider: 'invalid-provider' });
  } catch (err) {
    threwUnknown = true;
    assert((err as ImageProviderError).statusCode === 400, 'Provedor desconhecido retorna 400');
  }
  assert(threwUnknown, 'Factory rejeita provider desconhecido');

  console.log('\n==================================================');
  console.log('TODOS OS TESTES ISOLADOS PASSARAM COM SUCESSO! 🎉');
  console.log('==================================================');
}

runTests().catch((err) => {
  console.error('Falha geral no teste:', err);
  process.exit(1);
});
