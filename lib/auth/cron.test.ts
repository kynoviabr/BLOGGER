import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { verifyCronSecret } from './cron';

const originalSecret = process.env.CRON_SECRET;
const originalPreviousSecret = process.env.CRON_SECRET_PREVIOUS;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalSecret;
  }

  if (originalPreviousSecret === undefined) {
    delete process.env.CRON_SECRET_PREVIOUS;
  } else {
    process.env.CRON_SECRET_PREVIOUS = originalPreviousSecret;
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

  it('accepts the previous secret only during a controlled rotation', () => {
    process.env.CRON_SECRET = 'new-secure-random-secret-with-32-chars';
    process.env.CRON_SECRET_PREVIOUS = 'previous-secure-secret-with-32-chars';
    const previous = new NextRequest('https://example.com/api/cron/publish-content', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET_PREVIOUS}` },
    });

    expect(verifyCronSecret(previous)).toBe(true);
  });

  it('rejects the previous secret after it is removed', () => {
    process.env.CRON_SECRET = 'new-secure-random-secret-with-32-chars';
    delete process.env.CRON_SECRET_PREVIOUS;
    const previous = new NextRequest('https://example.com/api/cron/publish-content', {
      headers: { authorization: 'Bearer previous-secure-secret-with-32-chars' },
    });

    expect(verifyCronSecret(previous)).toBe(false);
  });
});
