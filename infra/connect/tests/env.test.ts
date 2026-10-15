import { describe, expect, it } from 'vitest';
import { dodoCredential, dodoProducts, isPresent, scribaseMailCredential } from '../src/env.js';
import type { ConnectEnv } from '../src/env.js';

function baseEnv(overrides: Partial<ConnectEnv> = {}): ConnectEnv {
  return {
    HYPERDRIVE: { connectionString: 'postgresql://localhost/x' },
    APP_URL: 'https://recoder.xyz',
    CONNECT_URL: 'https://connect.recoder.xyz',
    BETTER_AUTH_BASE_URL: 'https://connect.recoder.xyz/api/auth',
    SCRIBASE_MAIL_API_URL: 'https://api.scribase.com',
    SCRIBASE_MAIL_FROM: 'Recoder <connect@mail.recoder.xyz>',
    ...overrides,
  };
}

describe('isPresent', () => {
  it('is false for undefined, null, and empty/whitespace strings', () => {
    expect(isPresent(undefined)).toBe(false);
    expect(isPresent(null)).toBe(false);
    expect(isPresent('')).toBe(false);
    expect(isPresent('   ')).toBe(false);
  });

  it('is true for a non-empty string', () => {
    expect(isPresent('sk_live_abc')).toBe(true);
  });
});

describe('dodoCredential', () => {
  it('reports absent when no key/secret are set, defaulting to test mode', () => {
    const credential = dodoCredential(baseEnv());
    expect(credential.present).toBe(false);
    expect(credential.webhookSecretPresent).toBe(false);
    expect(credential.testMode).toBe(true);
  });

  it('reports present when both the api key and webhook secret are set', () => {
    const credential = dodoCredential(
      baseEnv({ RECODER_CONNECT_DODO_API_KEY: 'sk_test_1', RECODER_CONNECT_DODO_WEBHOOK_SECRET: 'whsec_1' }),
    );
    expect(credential.present).toBe(true);
    expect(credential.webhookSecretPresent).toBe(true);
  });

  it('is only live mode when the flag is the exact string "false"', () => {
    expect(dodoCredential(baseEnv({ RECODER_CONNECT_DODO_TEST_MODE: 'false' })).testMode).toBe(false);
    expect(dodoCredential(baseEnv({ RECODER_CONNECT_DODO_TEST_MODE: 'anything-else' })).testMode).toBe(true);
  });
});

describe('dodoProducts', () => {
  it('defaults every product id to null when unset', () => {
    expect(dodoProducts(baseEnv())).toEqual({ pro_monthly: null, pro_annual: null, team_monthly: null });
  });

  it('reads configured product ids through', () => {
    const products = dodoProducts(baseEnv({ RECODER_CONNECT_DODO_PRODUCT_PRO_MONTHLY: 'pdt_1' }));
    expect(products.pro_monthly).toBe('pdt_1');
    expect(products.team_monthly).toBeNull();
  });
});

describe('scribaseMailCredential', () => {
  it('is not present without an API key', () => {
    expect(scribaseMailCredential(baseEnv()).present).toBe(false);
  });

  it('carries the from address and api url through when the key is set', () => {
    const credential = scribaseMailCredential(baseEnv({ SCRIBASE_MAIL_API_KEY: 'smail_live_1' }));
    expect(credential.present).toBe(true);
    expect(credential.from).toBe('Recoder <connect@mail.recoder.xyz>');
    expect(credential.apiUrl).toBe('https://api.scribase.com');
  });
});
