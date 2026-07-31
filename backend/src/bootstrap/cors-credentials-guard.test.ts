import { describe, it, expect } from 'vitest';
import { corsCredentialsGuardErrors, loadConfig } from './config.js';

describe('CORS credentials + wildcard boot guard (item #43)', () => {
  describe('corsCredentialsGuardErrors (pure)', () => {
    it('FLAGS credentials + wildcard "*" origin as a fatal misconfig', () => {
      const errors = corsCredentialsGuardErrors({ origins: ['*'], allowCredentials: true });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/credential/i);
      expect(errors[0]).toMatch(/\*/);
    });

    it('PASSES credentials + a specific origin allowlist', () => {
      expect(
        corsCredentialsGuardErrors({ origins: ['https://app.recoder.xyz'], allowCredentials: true }),
      ).toEqual([]);
    });

    it('PASSES a wildcard origin when credentials are OFF (no reflect-any + credentials pairing)', () => {
      expect(corsCredentialsGuardErrors({ origins: ['*'], allowCredentials: false })).toEqual([]);
    });

    it('PASSES an empty origin allowlist (reflects nothing — the desktop/self-host default)', () => {
      expect(corsCredentialsGuardErrors({ origins: [], allowCredentials: true })).toEqual([]);
    });
  });

  describe('loadConfig integration', () => {
    it('REFUSES to boot when CORS_ORIGINS is "*" (credentials default ON)', () => {
      expect(() => loadConfig({ CORS_ORIGINS: '*' })).toThrow(/Invalid environment configuration/);
    });

    it('boots with a specific CORS_ORIGINS allowlist', () => {
      expect(() => loadConfig({ CORS_ORIGINS: 'https://app.recoder.xyz' })).not.toThrow();
    });

    it('boots with an empty CORS_ORIGINS (desktop/self-host default)', () => {
      expect(() => loadConfig({})).not.toThrow();
    });
  });
});
