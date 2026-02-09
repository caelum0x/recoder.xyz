import { describe, expect, it } from 'vitest';
import {
  buildInternalServiceHeaders,
  normalizeByokKeysPayload,
  validateProviderKeyFormats,
  getAvailableProviders,
  SUPPORTED_PROVIDERS,
} from './byok-provider-keys.js';

describe('normalizeByokKeysPayload', () => {
  it('returns only non-empty string keys', () => {
    const result = normalizeByokKeysPayload({
      keys: {
        openrouter: 'or-key',
        openai: '   ',
        anthropic: 123,
        google: 'g-key',
      },
    });

    expect(result).toEqual({
      openrouter: 'or-key',
      google: 'g-key',
    });
  });

  it('returns empty object for invalid payload shape', () => {
    expect(normalizeByokKeysPayload(null)).toEqual({});
    expect(normalizeByokKeysPayload({})).toEqual({});
    expect(normalizeByokKeysPayload({ keys: [] })).toEqual({});
  });

  it('builds signed internal headers', () => {
    const headers = buildInternalServiceHeaders({
      method: 'PUT',
      pathname: '/api/user/ai-provider-keys',
      body: JSON.stringify({ userId: 'u1', serviceKey: 'internal-key' }),
      serviceKey: 'internal-key',
      timestampMs: 1738990000000,
      nonce: 'nonce-1',
    });

    expect(headers.get('x-internal-service-key')).toBe('internal-key');
    expect(headers.get('x-internal-timestamp')).toBe('1738990000000');
    expect(headers.get('x-internal-nonce')).toBe('nonce-1');
    expect(headers.get('x-internal-signature')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('validateProviderKeyFormats', () => {
  it('returns no warnings for correctly prefixed keys', () => {
    const warnings = validateProviderKeyFormats({
      openai: 'sk-abc123',
      anthropic: 'sk-ant-xyz',
      google: 'AIzaSyD-abc',
      groq: 'gsk_abc',
      openrouter: 'sk-or-abc',
    });
    expect(warnings).toEqual([]);
  });

  it('warns for incorrectly prefixed keys', () => {
    const warnings = validateProviderKeyFormats({
      openai: 'wrong-prefix-key',
      anthropic: 'also-wrong',
    });
    expect(warnings).toHaveLength(2);
    expect(warnings[0].provider).toBe('openai');
    expect(warnings[1].provider).toBe('anthropic');
  });

  it('skips empty and unknown providers', () => {
    const warnings = validateProviderKeyFormats({
      openai: '',
      unknownProvider: 'some-key',
    });
    expect(warnings).toEqual([]);
  });
});

describe('getAvailableProviders', () => {
  it('returns providers with configured keys in priority order', () => {
    const result = getAvailableProviders({
      anthropic: 'sk-ant-key',
      openai: 'sk-key',
    });
    expect(result).toEqual(['openai', 'anthropic']);
  });

  it('returns empty for no keys', () => {
    expect(getAvailableProviders({})).toEqual([]);
  });
});

describe('SUPPORTED_PROVIDERS', () => {
  it('lists all supported providers', () => {
    expect(SUPPORTED_PROVIDERS).toContain('openai');
    expect(SUPPORTED_PROVIDERS).toContain('anthropic');
    expect(SUPPORTED_PROVIDERS).toContain('google');
    expect(SUPPORTED_PROVIDERS.length).toBeGreaterThanOrEqual(6);
  });
});
