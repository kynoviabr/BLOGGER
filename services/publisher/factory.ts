import { PublisherProvider } from './publisher-provider.interface';
import { WordPressProvider } from './wordpress-provider';
import { MockPublisherProvider } from './mock-publisher-provider';
import { logger } from '@/lib/logger';

export interface PublisherFactoryOptions {
  siteUrl?: string;
  username?: string;
  applicationPassword?: string;
  forceMock?: boolean;
}

/**
 * Factory para criação do provedor de publicação.
 * Seleciona WordPressProvider se as credenciais estiverem configuradas, ou MockPublisherProvider para desenvolvimento/testes.
 */
export function createPublisherProvider(options: PublisherFactoryOptions = {}): PublisherProvider {
  const siteUrl = options.siteUrl || process.env.WORDPRESS_SITE_URL;
  const username = options.username || process.env.WORDPRESS_USERNAME;
  const appPassword = options.applicationPassword || process.env.WORDPRESS_APPLICATION_PASSWORD;

  const hasCredentials = !!(siteUrl && username && appPassword);
  const isMock = options.forceMock || process.env.PUBLISHER_TYPE === 'mock' || !hasCredentials;

  if (isMock) {
    logger.info('PublisherFactory', 'Instanciando MockPublisherProvider (sem credenciais WordPress ou mock forçado)');
    return new MockPublisherProvider();
  }

  return new WordPressProvider({
    siteUrl,
    username,
    applicationPassword: appPassword,
  });
}
