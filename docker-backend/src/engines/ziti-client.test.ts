/**
 * Tests for the ziti-client degrade-safe seam.
 *
 * Verifies the contract WITHOUT a real OpenZiti controller, binary build, or
 * network connection:
 *   - resolveControllerUrl() resolves / trims from env and returns undefined
 *     when unset.
 *   - zitiHealth() returns { available: false, configured: false } when env
 *     vars are absent (the "mesh unavailable" truthful path).
 *   - zitiHealth() returns { available: false, configured: true } when env
 *     vars are present but the controller is unreachable (network error path).
 *   - listIdentities() returns { available: false } when not configured.
 *   - createIdentity() returns { available: false } when not configured.
 *   - provisionRunnerIdentity() returns { available: false } when not configured.
 *   - deleteIdentity() returns { available: false, deleted: false } when not configured.
 *   - __resetZitiForTest() clears the session cache for test isolation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ZITI_CONTROLLER_URL_ENV,
  ZITI_API_TOKEN_ENV,
  ZITI_ADMIN_USERNAME_ENV,
  ZITI_ADMIN_PASSWORD_ENV,
  resolveControllerUrl,
  zitiHealth,
  listIdentities,
  createIdentity,
  provisionRunnerIdentity,
  deleteIdentity,
  __resetZitiForTest,
} from './ziti-client.js';

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

const ZITI_KEYS = [
  ZITI_CONTROLLER_URL_ENV,
  ZITI_API_TOKEN_ENV,
  ZITI_ADMIN_USERNAME_ENV,
  ZITI_ADMIN_PASSWORD_ENV,
];

const saved: Record<string, string | undefined> = {};

function clearZitiEnv(): void {
  for (const key of ZITI_KEYS) {
    delete process.env[key];
  }
}

function restoreZitiEnv(): void {
  for (const key of ZITI_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

beforeEach(() => {
  for (const key of ZITI_KEYS) {
    saved[key] = process.env[key];
  }
  clearZitiEnv();
  __resetZitiForTest();
});

afterEach(() => {
  restoreZitiEnv();
  __resetZitiForTest();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// resolveControllerUrl
// ---------------------------------------------------------------------------

describe('resolveControllerUrl', () => {
  it('returns undefined when ZITI_CONTROLLER_URL is not set', () => {
    expect(resolveControllerUrl({})).toBeUndefined();
  });

  it('returns undefined when ZITI_CONTROLLER_URL is an empty string', () => {
    expect(resolveControllerUrl({ [ZITI_CONTROLLER_URL_ENV]: '' })).toBeUndefined();
  });

  it('returns undefined when ZITI_CONTROLLER_URL is whitespace only', () => {
    expect(resolveControllerUrl({ [ZITI_CONTROLLER_URL_ENV]: '   ' })).toBeUndefined();
  });

  it('returns the trimmed URL with trailing slash removed', () => {
    const result = resolveControllerUrl({
      [ZITI_CONTROLLER_URL_ENV]: '  https://ziti.example.com:1280/  ',
    });
    expect(result).toBe('https://ziti.example.com:1280');
  });

  it('preserves a URL without a trailing slash unchanged (after trim)', () => {
    const result = resolveControllerUrl({
      [ZITI_CONTROLLER_URL_ENV]: 'https://ziti.example.com:1280',
    });
    expect(result).toBe('https://ziti.example.com:1280');
  });
});

// ---------------------------------------------------------------------------
// zitiHealth — unconfigured (truthful "mesh unavailable")
// ---------------------------------------------------------------------------

describe('zitiHealth: unconfigured', () => {
  it('returns available=false, configured=false when no env vars are set', async () => {
    const health = await zitiHealth();
    expect(health.available).toBe(false);
    expect(health.configured).toBe(false);
    expect(typeof health.reason).toBe('string');
    expect(health.reason!.length).toBeGreaterThan(0);
  });

  it('returns available=false, configured=false when only ZITI_CONTROLLER_URL is set (no creds)', async () => {
    process.env[ZITI_CONTROLLER_URL_ENV] = 'https://ziti.example.com:1280';
    const health = await zitiHealth();
    expect(health.available).toBe(false);
    expect(health.configured).toBe(false);
  });

  it('returns the controller URL in the health result when URL is set', async () => {
    process.env[ZITI_CONTROLLER_URL_ENV] = 'https://ziti.example.com:1280';
    const health = await zitiHealth();
    // URL is returned even if not fully configured so callers can diagnose.
    expect(health.controllerUrl).toBe('https://ziti.example.com:1280');
  });

  it('returns available=false, configured=false when only ZITI_API_TOKEN is set (no URL)', async () => {
    process.env[ZITI_API_TOKEN_ENV] = 'tok-abc123';
    const health = await zitiHealth();
    expect(health.available).toBe(false);
    expect(health.configured).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// zitiHealth — configured but controller unreachable (password auth path)
//
// We use username+password creds (not ZITI_API_TOKEN) so that authenticate()
// actually tries to POST to the controller instead of short-circuiting with a
// static token. The `.invalid` TLD is guaranteed non-resolvable per RFC 2606.
// ---------------------------------------------------------------------------

describe('zitiHealth: configured but controller unreachable (password auth)', () => {
  beforeEach(() => {
    process.env[ZITI_CONTROLLER_URL_ENV] = 'https://ziti-unreachable.invalid:1280';
    process.env[ZITI_ADMIN_USERNAME_ENV] = 'admin';
    process.env[ZITI_ADMIN_PASSWORD_ENV] = 'recoder_ziti_admin';
  });

  it('returns configured=true and available=false with a non-empty reason', async () => {
    const health = await zitiHealth();
    expect(health.configured).toBe(true);
    expect(health.available).toBe(false);
    expect(typeof health.reason).toBe('string');
    expect(health.reason!.length).toBeGreaterThan(0);
  }, 30_000);

  it('includes the controller URL in the health result', async () => {
    const health = await zitiHealth();
    expect(health.controllerUrl).toBe('https://ziti-unreachable.invalid:1280');
  }, 30_000);
});

// ---------------------------------------------------------------------------
// zitiHealth — static token path: authenticate() short-circuits (no network)
//
// When ZITI_API_TOKEN is set, authenticate() returns it immediately without
// hitting the controller. Health therefore reports configured=true, available=true
// (the token is accepted as the auth credential; reachability is not verified).
// This is the expected truthful behavior: the client defers controller-reachability
// to the first real API call.
// ---------------------------------------------------------------------------

describe('zitiHealth: static token (no network call to controller)', () => {
  it('reports configured=true, available=true (token accepted without network check)', async () => {
    process.env[ZITI_CONTROLLER_URL_ENV] = 'https://ziti.example.internal:1280';
    process.env[ZITI_API_TOKEN_ENV] = 'tok-static-test';
    const health = await zitiHealth();
    expect(health.configured).toBe(true);
    expect(health.available).toBe(true);
    expect(health.reason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listIdentities — degrade-safe when unconfigured
// ---------------------------------------------------------------------------

describe('listIdentities: unconfigured', () => {
  it('returns available=false and an empty identities array', async () => {
    const result = await listIdentities();
    expect(result.available).toBe(false);
    expect(result.identities).toEqual([]);
    expect(typeof result.reason).toBe('string');
  });

  it('returns available=false when a filter is supplied but Ziti is unconfigured', async () => {
    const result = await listIdentities('name="runner-01"');
    expect(result.available).toBe(false);
    expect(result.identities).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createIdentity — degrade-safe when unconfigured
// ---------------------------------------------------------------------------

describe('createIdentity: unconfigured', () => {
  it('returns available=false with no identity object', async () => {
    const result = await createIdentity({ name: 'runner-01' });
    expect(result.available).toBe(false);
    expect(result.identity).toBeUndefined();
    expect(typeof result.reason).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// provisionRunnerIdentity — degrade-safe when unconfigured
// ---------------------------------------------------------------------------

describe('provisionRunnerIdentity: unconfigured', () => {
  it('returns available=false', async () => {
    const result = await provisionRunnerIdentity('runner-01');
    expect(result.available).toBe(false);
    expect(result.identity).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteIdentity — degrade-safe when unconfigured
// ---------------------------------------------------------------------------

describe('deleteIdentity: unconfigured', () => {
  it('returns available=false and deleted=false', async () => {
    const result = await deleteIdentity('some-id');
    expect(result.available).toBe(false);
    expect(result.deleted).toBe(false);
    expect(typeof result.reason).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// __resetZitiForTest — session cache isolation
// ---------------------------------------------------------------------------

describe('__resetZitiForTest', () => {
  it('is callable without error before any session is established', () => {
    expect(() => __resetZitiForTest()).not.toThrow();
  });

  it('does not throw when called multiple times', () => {
    expect(() => {
      __resetZitiForTest();
      __resetZitiForTest();
    }).not.toThrow();
  });
});
