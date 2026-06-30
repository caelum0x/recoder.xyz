/**
 * Unit tests for the desktop-auth seams in config.ts: identity surfacing,
 * sign-out (fail-safe, clears in-memory session), and transparent refresh.
 *
 * These exercise the REAL config logic against a stubbed window bridge — no
 * production code is mocked beyond the injected window.__RECODER_COCKPIT__ that
 * the Electron preload would provide.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasDesktopSignOut,
  readConfig,
  readIdentity,
  runDesktopRefresh,
  runDesktopSignOut,
  setRuntimeIdentity,
  setRuntimeToken,
} from './config';

function setBridge(bridge: Record<string, unknown>): void {
  (globalThis as Record<string, unknown>).window = { __RECODER_COCKPIT__: bridge };
}

beforeEach(() => {
  setRuntimeToken(undefined);
  setRuntimeIdentity(undefined);
});

afterEach(() => {
  setRuntimeToken(undefined);
  setRuntimeIdentity(undefined);
  delete (globalThis as Record<string, unknown>).window;
});

describe('identity surfacing', () => {
  it('reads the injected identity (email + plan)', () => {
    setBridge({ backendUrl: 'http://x', identity: { email: 'a@b.co', plan: 'pro' } });
    expect(readIdentity()).toEqual({ email: 'a@b.co', plan: 'pro' });
    expect(readConfig().identity).toEqual({ email: 'a@b.co', plan: 'pro' });
  });

  it('returns null identity when none was injected (never fabricated)', () => {
    setBridge({ backendUrl: 'http://x' });
    expect(readIdentity()).toBeNull();
    expect(readConfig().identity).toBeUndefined();
  });
});

describe('hasDesktopSignOut', () => {
  it('is true only when the bridge exposes signOut', () => {
    setBridge({ backendUrl: 'http://x', signOut: () => Promise.resolve({ ok: true }) });
    expect(hasDesktopSignOut()).toBe(true);
    setBridge({ backendUrl: 'http://x' });
    expect(hasDesktopSignOut()).toBe(false);
  });
});

describe('runDesktopSignOut', () => {
  it('clears the in-memory token and calls the bridge', async () => {
    const signOut = vi.fn().mockResolvedValue({ ok: true });
    setBridge({ backendUrl: 'http://x', token: 'tok', signOut });
    setRuntimeToken('runtime-tok');
    expect(readConfig().token).toBe('runtime-tok');

    const res = await runDesktopSignOut();
    expect(res.ok).toBe(true);
    expect(signOut).toHaveBeenCalledOnce();
    // In-memory runtime token gone → falls back to injected token only.
    expect(readConfig().token).toBe('tok');
  });

  it('suppresses the injected identity after sign-out (no stale email)', async () => {
    setBridge({
      backendUrl: 'http://x',
      identity: { email: 'a@b.co' },
      signOut: () => Promise.resolve({ ok: true }),
    });
    expect(readIdentity()).toEqual({ email: 'a@b.co' });
    await runDesktopSignOut();
    expect(readIdentity()).toBeNull();
  });

  it('is fail-safe: returns ok and clears the session even when the bridge throws', async () => {
    setBridge({
      backendUrl: 'http://x',
      signOut: () => Promise.reject(new Error('boom')),
    });
    setRuntimeToken('runtime-tok');
    const res = await runDesktopSignOut();
    expect(res.ok).toBe(true);
    expect(readConfig().token).toBeUndefined();
  });

  it('is fail-safe with no bridge: still drops the in-memory session', async () => {
    setBridge({ backendUrl: 'http://x' });
    setRuntimeToken('runtime-tok');
    const res = await runDesktopSignOut();
    expect(res.ok).toBe(true);
    expect(readConfig().token).toBeUndefined();
  });
});

describe('runDesktopRefresh', () => {
  it('stores the fresh token + identity on success', async () => {
    setBridge({
      backendUrl: 'http://x',
      refreshToken: () =>
        Promise.resolve({ ok: true, token: 'fresh', identity: { email: 'a@b.co' } }),
    });
    const res = await runDesktopRefresh();
    expect(res.ok).toBe(true);
    expect(readConfig().token).toBe('fresh');
    expect(readIdentity()).toEqual({ email: 'a@b.co' });
  });

  it('does not fabricate a token when the bridge is missing', async () => {
    setBridge({ backendUrl: 'http://x' });
    const res = await runDesktopRefresh();
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('no-desktop-refresh');
    expect(readConfig().token).toBeUndefined();
  });

  it('keeps the session signed-out when refresh returns not-ok', async () => {
    setBridge({
      backendUrl: 'http://x',
      refreshToken: () => Promise.resolve({ ok: false, reason: 'refresh-failed' }),
    });
    const res = await runDesktopRefresh();
    expect(res.ok).toBe(false);
    expect(readConfig().token).toBeUndefined();
  });
});
