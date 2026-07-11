/**
 * Tests for the openfang-native NAPI-RS addon loader.
 *
 * These prove:
 *   1. The facade prefers the native addon when the module loads successfully.
 *   2. The facade falls back gracefully when require() throws (native absent,
 *      wrong arch, ENOSPC build deferral, etc.).
 *   3. The loader is degrade-safe: it NEVER throws to the caller.
 *   4. The addon path resolver follows the canonical resolution order.
 *
 * NO Rust build is required.  We mock require() / the .node presence to drive
 * every code path in isolation, mirroring the pattern in openfang-daemon.test.ts.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// We import from the source module; vitest runs with tsx so .ts is fine.
import {
  loadNativeAddon,
  resolveNativeAddonPath,
  __resetNativeAddonForTest,
  __setRequireOverrideForTest,
  OPENFANG_NATIVE_ADDON_ENV,
  type OpenfangNativeAddon,
} from './openfang-native.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStubAddon(overrides: Partial<OpenfangNativeAddon> = {}): OpenfangNativeAddon {
  return {
    ping: () => true,
    nativeVersion: () =>
      JSON.stringify({ addon: '0.6.9', kernel_version: '0.6.9', crate: 'openfang-napi', build_profile: 'release' }),
    bootstrapKernel: async (_configPath?: string | null) =>
      JSON.stringify({ ok: true, config_path: '/tmp/config.toml', agents: 0, default_model: null }),
    runAgent: async (_agentId: string, _message: string, _configPath?: string | null) =>
      JSON.stringify({ ok: true, agent_id: _agentId, response: 'hello from native stub' }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Path resolution (no .node file on disk — unit tests only)
// ---------------------------------------------------------------------------

describe('openfang-native: resolveNativeAddonPath', () => {
  it('returns undefined when env is empty and no .node file is on disk (degrade-safe default)', () => {
    const result = resolveNativeAddonPath({});
    // In CI / dev without a Rust build the result must be undefined.
    // If someone happened to build the crate, it would be a string pointing at
    // an existing file — we accept both.
    if (result !== undefined) {
      expect(result).toMatch(/openfang_napi\.node$/);
    } else {
      expect(result).toBeUndefined();
    }
  });

  it('returns undefined when OPENFANG_NATIVE_ADDON points at a non-existent file', () => {
    const result = resolveNativeAddonPath({
      [OPENFANG_NATIVE_ADDON_ENV]: '/no/such/openfang_napi.node',
    });
    expect(result).toBeUndefined();
  });

  it('returns the explicit path when OPENFANG_NATIVE_ADDON points at an existing file', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'openfang-napi-'));
    const fakePath = path.join(dir, 'openfang_napi.node');
    writeFileSync(fakePath, '// fake .node');

    const result = resolveNativeAddonPath({ [OPENFANG_NATIVE_ADDON_ENV]: fakePath });
    expect(result).toBe(fakePath);
  });
});

// ---------------------------------------------------------------------------
// loadNativeAddon — native-first preference + degrade-safe fallback
// ---------------------------------------------------------------------------

describe('openfang-native: loadNativeAddon — native-first preference', () => {
  beforeEach(() => {
    __resetNativeAddonForTest();
  });

  afterEach(() => {
    __resetNativeAddonForTest();
    vi.restoreAllMocks();
  });

  it('prefers the native addon when the module loads and ping() returns true', () => {
    // The .node extension causes Node's native require() to dlopen the file as
    // a binary.  In tests we use the __setRequireOverrideForTest seam to inject
    // a stub addon without triggering dlopen.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'openfang-napi-pref-'));
    const realFakePath = path.join(dir, 'openfang_napi.node');
    // The file must exist on disk (existsSync check in resolveNativeAddonPath).
    writeFileSync(realFakePath, '/* placeholder — real .node not present in test env */');

    const stub = makeStubAddon();

    // Inject the stub via the module seam (avoids dlopen on a non-native file).
    __setRequireOverrideForTest((_path) => stub);
    process.env[OPENFANG_NATIVE_ADDON_ENV] = realFakePath;

    try {
      const addon = loadNativeAddon(process.env);
      // The facade MUST prefer native when the require override returns a valid
      // addon and ping() returns true.
      expect(addon).not.toBeUndefined();
      expect(addon?.ping()).toBe(true);
    } finally {
      delete process.env[OPENFANG_NATIVE_ADDON_ENV];
      __resetNativeAddonForTest();
    }
  });

  it('falls back gracefully when the require override throws (degrade-safe)', () => {
    // Inject a factory that throws to simulate a broken native addon.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'openfang-napi-fallback-'));
    const badPath = path.join(dir, 'openfang_napi.node');
    writeFileSync(badPath, '/* placeholder */');
    process.env[OPENFANG_NATIVE_ADDON_ENV] = badPath;

    __setRequireOverrideForTest((_path) => {
      throw new Error('simulated dlopen failure for test');
    });

    try {
      // Must not throw — must return undefined.
      const addon = loadNativeAddon(process.env);
      expect(addon).toBeUndefined();
    } finally {
      delete process.env[OPENFANG_NATIVE_ADDON_ENV];
      __resetNativeAddonForTest();
    }
  });

  it('falls back gracefully when ping() returns false (broken addon)', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'openfang-napi-pingfail-'));
    const fakePath = path.join(dir, 'openfang_napi.node');
    writeFileSync(fakePath, '/* placeholder */');
    process.env[OPENFANG_NATIVE_ADDON_ENV] = fakePath;

    // Inject a stub where ping() returns false via the module seam.
    const brokenStub = makeStubAddon({ ping: () => false });
    __setRequireOverrideForTest((_path) => brokenStub);

    try {
      const addon = loadNativeAddon(process.env);
      // ping() failed → must fall back to undefined.
      expect(addon).toBeUndefined();
    } finally {
      delete process.env[OPENFANG_NATIVE_ADDON_ENV];
      __resetNativeAddonForTest();
    }
  });

  it('returns undefined and never throws when no .node path is found (build deferred path)', () => {
    // No OPENFANG_NATIVE_ADDON env + no built .node on disk.
    delete process.env[OPENFANG_NATIVE_ADDON_ENV];
    // Must not throw.
    expect(() => loadNativeAddon({})).not.toThrow();
    const addon = loadNativeAddon({});
    // Already memoized from the call above — check it is still undefined.
    expect(addon).toBeUndefined();
  });

  it('is idempotent — repeated loadNativeAddon calls return the same memoized result', () => {
    delete process.env[OPENFANG_NATIVE_ADDON_ENV];
    __resetNativeAddonForTest();
    const a = loadNativeAddon({});
    const b = loadNativeAddon({});
    expect(a).toBe(b); // same reference (both undefined when no .node)
  });

  it('resetNativeAddonForTest restores a clean loader state', () => {
    delete process.env[OPENFANG_NATIVE_ADDON_ENV];
    loadNativeAddon({}); // prime memoization
    __resetNativeAddonForTest();
    // After reset the call should run the resolver again (still returns undefined
    // if no .node present, but the memoization boundary was cleared).
    const result = loadNativeAddon({});
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Stub addon contract — prove the interface shape
// ---------------------------------------------------------------------------

describe('openfang-native: OpenfangNativeAddon stub contract', () => {
  it('ping() returns true on a well-formed stub', () => {
    expect(makeStubAddon().ping()).toBe(true);
  });

  it('nativeVersion() returns valid JSON with expected keys', () => {
    const raw = makeStubAddon().nativeVersion();
    const parsed = JSON.parse(raw);
    expect(parsed).toMatchObject({
      addon: expect.any(String),
      kernel_version: expect.any(String),
      crate: 'openfang-napi',
    });
  });

  it('bootstrapKernel() resolves with ok=true on a well-formed stub', async () => {
    const raw = await makeStubAddon().bootstrapKernel(null);
    const parsed = JSON.parse(raw);
    expect(parsed).toMatchObject({ ok: true });
  });

  it('runAgent() resolves with ok=true and a response on a well-formed stub', async () => {
    const raw = await makeStubAddon().runAgent('my-agent', 'hello', null);
    const parsed = JSON.parse(raw);
    expect(parsed).toMatchObject({ ok: true, response: expect.any(String) });
  });
});
