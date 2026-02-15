import { describe, expect, it } from 'vitest';
import { copyRateLimitHeaders } from './rate-limit-headers';

describe('copyRateLimitHeaders', () => {
  it('copies modern and legacy rate-limit headers', () => {
    const source = new Headers({
      'RateLimit-Limit': '20',
      'RateLimit-Remaining': '19',
      'RateLimit-Reset': '1739000000',
      'RateLimit-Policy': '20;w=60',
      'X-RateLimit-Limit': '30',
      'Retry-After': '5',
    });
    const target = new Headers();

    copyRateLimitHeaders(source, target);

    expect(target.get('RateLimit-Limit')).toBe('20');
    expect(target.get('RateLimit-Policy')).toBe('20;w=60');
    expect(target.get('X-RateLimit-Limit')).toBe('30');
    expect(target.get('Retry-After')).toBe('5');
  });
});
