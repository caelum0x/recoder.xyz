import { describe, it, expect } from 'vitest';
import { extractBearerToken, verifyBridgeBearer } from './bridge-auth.js';

describe('extractBearerToken', () => {
  it('extracts the token from a Bearer header (case-insensitive)', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
    expect(extractBearerToken('bearer abc123')).toBe('abc123');
  });
  it('returns empty string when no bearer token is present', () => {
    expect(extractBearerToken('')).toBe('');
    expect(extractBearerToken('Basic xyz')).toBe('');
  });
  it('preserves the original case of the token (tokens are case-sensitive)', () => {
    expect(extractBearerToken('Bearer MyToken123ABC')).toBe('MyToken123ABC');
  });
});

describe('verifyBridgeBearer', () => {
  it('denies with 503 when no expected token is configured (fail-closed)', () => {
    expect(verifyBridgeBearer('anything', undefined)).toEqual({
      ok: false, status: 503, error: 'Bridge auth not configured',
    });
    expect(verifyBridgeBearer('anything', '')).toEqual({
      ok: false, status: 503, error: 'Bridge auth not configured',
    });
  });
  it('denies with 401 when the bearer token is empty', () => {
    expect(verifyBridgeBearer('', 'secret')).toEqual({
      ok: false, status: 401, error: 'Unauthorized bridge token',
    });
  });
  it('denies with 401 when the token does not match', () => {
    expect(verifyBridgeBearer('wrong', 'secret')).toEqual({
      ok: false, status: 401, error: 'Unauthorized bridge token',
    });
  });
  it('denies mismatched-length tokens without throwing', () => {
    expect(verifyBridgeBearer('short', 'a-much-longer-secret')).toEqual({
      ok: false, status: 401, error: 'Unauthorized bridge token',
    });
  });
  it('allows an exact match', () => {
    expect(verifyBridgeBearer('secret', 'secret')).toEqual({ ok: true });
  });
});
