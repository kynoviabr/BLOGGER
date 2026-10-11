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

/**
 * Extrai as credenciais e endpoint do WordPress configurados para um Blog específico.
 * Se não estiverem preenchidos no cadastro do Blog, faz fallback para as variáveis de ambiente globais.
 */
export function getWordPressConfigForBlog(blog?: {
  domain?: string | null;
  editorial_config?: unknown;
} | null): PublisherFactoryOptions {
  const edConfig = blog?.editorial_config as Record<string, unknown> | null;
  const wpConfig = edConfig?.wordpress as {
    wp_site_url?: string;
    wp_username?: string;
    wp_application_password?: string;
  } | undefined;

  let siteUrl = wpConfig?.wp_site_url?.trim();
  if (!siteUrl && blog?.domain) {
    siteUrl = blog.domain.startsWith('http') ? blog.domain : `https://${blog.domain}`;
  }

  return {
    siteUrl: siteUrl || process.env.WORDPRESS_SITE_URL,
    username: wpConfig?.wp_username?.trim() || process.env.WORDPRESS_USERNAME,
    applicationPassword: wpConfig?.wp_application_password?.trim() || process.env.WORDPRESS_APPLICATION_PASSWORD,
  };
}

/**
 * Cria uma instância do PublisherProvider com credenciais específicas do Blog.
 */
export function createPublisherProviderForBlog(
  blog?: { domain?: string | null; editorial_config?: unknown } | null,
  options?: Partial<PublisherFactoryOptions>
): PublisherProvider {
  const blogOptions = getWordPressConfigForBlog(blog);
  return createPublisherProvider({
    ...blogOptions,
    ...options,
  });
}

