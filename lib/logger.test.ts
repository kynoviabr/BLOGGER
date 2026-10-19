import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from './logger';

describe('SystemLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts credentials recursively before writing metadata', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logger.info('SecurityTest', 'redaction', {
      apiKey: 'api-secret',
      nested: {
        wp_application_password: 'wordpress-secret',
        authorization: 'Bearer cron-secret',
        safeValue: 'visible',
      },
    });

    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0][1]).toEqual({
      apiKey: '[REDACTED]',
      nested: {
        wp_application_password: '[REDACTED]',
        authorization: '[REDACTED]',
        safeValue: 'visible',
      },
    });
  });

  it('keeps useful Error diagnostics without exposing custom secret fields', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('provider failed');
    Object.assign(error, { token: 'provider-token' });

    logger.error('SecurityTest', 'failure', { error });

    const metadata = errorLog.mock.calls[0][1] as { error: Record<string, unknown> };
    expect(metadata.error.name).toBe('Error');
    expect(metadata.error.message).toBe('provider failed');
    expect(JSON.stringify(metadata)).not.toContain('provider-token');
  });
});
