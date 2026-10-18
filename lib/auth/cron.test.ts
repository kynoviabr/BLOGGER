import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { verifyCronSecret } from './cron';

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalSecret;
  }
});

describe('verifyCronSecret', () => {
  it('fails closed when CRON_SECRET is absent', () => {
    delete process.env.CRON_SECRET;
    const request = new NextRequest('https://example.com/api/cron/publish-content', {
      headers: { authorization: 'Bearer any-value' },
    });

    expect(verifyCronSecret(request)).toBe(false);
  });

  it('accepts only the exact bearer secret', () => {
    process.env.CRON_SECRET = 'a-secure-random-secret-with-32-chars';
    const valid = new NextRequest('https://example.com/api/cron/publish-content', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const invalid = new NextRequest('https://example.com/api/cron/publish-content', {
      headers: { authorization: 'Bearer wrong-secret' },
    });

    expect(verifyCronSecret(valid)).toBe(true);
    expect(verifyCronSecret(invalid)).toBe(false);
  });
});
