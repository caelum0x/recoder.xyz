/**
 * Unit tests for config.ts — the shell<->renderer seam. Real logic; the only
 * test double is the injected `window` object the Electron shell would set.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configWasInjected,
  hasDesktopLogin,
  readConfig,
  runDesktopLogin,
  setRuntimeToken,
} from './config';

function setWindow(value: Record<string, unknown> | undefined): void {
  if (value === undefined) {
    delete (globalThis as Record<string, unknown>).window;
  } else {
    (globalThis as Record<string, unknown>).window = value;
  }
}

beforeEach(() => {
  setRuntimeToken(undefined);
  setWindow(undefined);
});

afterEach(() => {
  setRuntimeToken(undefined);
  setWindow(undefined);
});

describe('readConfig backendUrl', () => {
  it('falls back to localhost:3100 with no token when nothing is injected', () => {
    const cfg = readConfig();
    expect(cfg.backendUrl).toBe('http://localhost:3100');
    expect(cfg.token).toBeUndefined();
  });

  it('uses the injected backendUrl and strips trailing slashes', () => {
    setWindow({ __RECODER_COCKPIT__: { backendUrl: 'https://api.recoder.xyz///' } });
    expect(readConfig().backendUrl).toBe('https://api.recoder.xyz');
  });
});

describe('token resolution priority', () => {
  it('reads the preload config token when no higher-priority token exists', () => {
    setWindow({ __RECODER_COCKPIT__: { backendUrl: 'http://x', token: 'preload-token' } });
    expect(readConfig().token).toBe('preload-token');
  });

  it('prefers the main-process runtime token over the preload token', () => {
    setWindow({
      __RECODER_COCKPIT__: { backendUrl: 'http://x', token: 'preload-token' },
      __RECODER_COCKPIT_RUNTIME__: { token: 'runtime-injected-token' },
    });
    expect(readConfig().token).toBe('runtime-injected-token');
  });

  it('prefers an in-memory login token over everything else', () => {
    setWindow({
      __RECODER_COCKPIT__: { backendUrl: 'http://x', token: 'preload-token' },
      __RECODER_COCKPIT_RUNTIME__: { token: 'runtime-injected-token' },
    });
    setRuntimeToken('logged-in-token');
    expect(readConfig().token).toBe('logged-in-token');
  });

  it('treats a whitespace-only login token as cleared', () => {
    setWindow({ __RECODER_COCKPIT__: { backendUrl: 'http://x', token: 'preload-token' } });
    setRuntimeToken('   ');
    expect(readConfig().token).toBe('preload-token');
  });

  it('trims a set login token', () => {
    setRuntimeToken('  spaced-token  ');
    expect(readConfig().token).toBe('spaced-token');
  });
});

describe('configWasInjected', () => {
  it('is false on the standalone fallback', () => {
    expect(configWasInjected()).toBe(false);
  });

  it('is true when the shell injected a config object', () => {
    setWindow({ __RECODER_COCKPIT__: { backendUrl: 'http://x' } });
    expect(configWasInjected()).toBe(true);
  });
});

describe('hasDesktopLogin', () => {
  it('is false without a login bridge', () => {
    setWindow({ __RECODER_COCKPIT__: { backendUrl: 'http://x' } });
    expect(hasDesktopLogin()).toBe(false);
  });

  it('is true when login is a function', () => {
    setWindow({ __RECODER_COCKPIT__: { backendUrl: 'http://x', login: async () => ({ ok: true }) } });
    expect(hasDesktopLogin()).toBe(true);
  });
});

describe('runDesktopLogin', () => {
  it('returns no-desktop-login when the bridge is absent and never fakes a token', async () => {
    const result = await runDesktopLogin();
    expect(result).toEqual({ ok: false, reason: 'no-desktop-login' });
    expect(readConfig().token).toBeUndefined();
  });

  it('stores the fresh token in-memory on a successful login', async () => {
    setWindow({
      __RECODER_COCKPIT__: {
        backendUrl: 'http://x',
        login: async () => ({ ok: true, token: 'fresh-session-token' }),
      },
    });
    const result = await runDesktopLogin();
    expect(result.ok).toBe(true);
    expect(readConfig().token).toBe('fresh-session-token');
  });

  it('does not store a token when login reports failure', async () => {
    setWindow({
      __RECODER_COCKPIT__: {
        backendUrl: 'http://x',
        token: 'preload-token',
        login: async () => ({ ok: false, reason: 'cancelled' }),
      },
    });
    const result = await runDesktopLogin();
    expect(result.ok).toBe(false);
    // Unchanged: still the preload token, not a fabricated one.
    expect(readConfig().token).toBe('preload-token');
  });
});
