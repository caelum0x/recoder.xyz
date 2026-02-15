import { describe, expect, it } from 'vitest';
import { sanitizePostgresText } from './postgres-text-safety';

describe('sanitizePostgresText', () => {
  it('replaces null characters with safe replacement character', () => {
    const input = 'a\u0000b\u0000c';
    const sanitized = sanitizePostgresText(input);

    expect(sanitized).toBe('a\uFFFDb\uFFFDc');
  });

  it('returns null for null/undefined inputs', () => {
    expect(sanitizePostgresText(null)).toBeNull();
    expect(sanitizePostgresText(undefined)).toBeNull();
  });
});
