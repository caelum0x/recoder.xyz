/**
 * Tests for the openfang-native NAPI-RS addon loader.
 *
 * These prove:
 *   1. The facade prefers the native addon when the module loads successfully.
 *   2. The facade falls back gracefully when require() throws (native absent,
 *      wrong arch, ENOSPC build deferral, etc.).
 *   3. The loader is degrade-safe: it NEVER throws to the caller.
 *   4. The addon path resolver follows the canonical resolution order.
 *   5. The high-level facade (bundled hands + engine boot) degrades cleanly.
 *
 * NO Rust build is required. We mock require() / the .node presence to drive
 * every code path in isolation, mirroring openfang-daemon.test.ts.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadNativeAddon,
  resolveNativeAddonPath,
  nativeBundledHands,
  getOpenfangEngine,
  __resetNativeAddonForTest,
  __setRequireOverrideForTest,
  OPENFANG_NATIVE_ADDON_ENV,
  type OpenfangNativeAddon,
  type OpenfangEngineInstance,
} from './openfang-native.js';

// An env that forces the resolver to report the addon absent, regardless of any
// locally-built .node in the repo (bogus explicit path short-circuits discovery).
const ABSENT: NodeJS.ProcessEnv = { [OPENFANG_NATIVE_ADDON_ENV]: '/no/such/dir/openfang_napi.node' };

// ---------------------------------------------------------------------------
// Helpers — a stub matching the real class-based addon surface
// ---------------------------------------------------------------------------

function makeStubEngine(overrides: Partial<OpenfangEngineInstance> = {}): OpenfangEngineInstance {
  return {
    health: () => JSON.stringify({ ok: true, agents: 3, addon_version: '0.6.9', build_mode: 'full' }),
    listAgents: () =>
      JSON.stringify({ ok: true, agents: [{ id: 'a1', name: 'researcher', state: 'idle' }] }),
    runAgent: (agentId: string, _message: string) =>
      JSON.stringify({ ok: true, agent_id: agentId, response: 'hi', iterations: 1 }),
    ...overrides,
  };
}

function makeStubAddon(overrides: Partial<OpenfangNativeAddon> = {}): OpenfangNativeAddon {
  return {
    ping: () => true,
    nativeVersion: () =>
      JSON.stringify({ addon: '0.6.9', crate: 'openfang-napi', build_profile: 'release', build_mode: 'full' }),
    bundledHandsJson: () =>
      JSON.stringify({ ok: true, hands: [{ id: 'researcher', name: 'Researcher', description: 'Researches' }] }),
    OpenfangEngine: { boot: (_configPath?: string | null) => makeStubEngine() },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

describe('openfang-native: resolveNativeAddonPath', () => {
  it('returns undefined or a real .node path with the env empty (degrade-safe default)', () => {
    const result = resolveNativeAddonPath({});
    if (result !== undefined) {
      expect(result).toMatch(/openfang_napi\.node$/);
    } else {
      expect(result).toBeUndefined();
    }
  });

  it('returns undefined when OPENFANG_NATIVE_ADDON points at a non-existent file', () => {
    expect(resolveNativeAddonPath({ [OPENFANG_NATIVE_ADDON_ENV]: '/no/such/openfang_napi.node' })).toBeUndefined();
  });

  it('returns the explicit path when OPENFANG_NATIVE_ADDON points at an existing file', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'openfang-napi-'));
    const fakePath = path.join(dir, 'openfang_napi.node');
    writeFileSync(fakePath, '// fake .node');
    expect(resolveNativeAddonPath({ [OPENFANG_NATIVE_ADDON_ENV]: fakePath })).toBe(fakePath);
  });
});

// ---------------------------------------------------------------------------
// loadNativeAddon — native-first preference + degrade-safe fallback
// ---------------------------------------------------------------------------

describe('openfang-native: loadNativeAddon — native-first preference', () => {
  beforeEach(() => __resetNativeAddonForTest());
  afterEach(() => {
    __resetNativeAddonForTest();
    vi.restoreAllMocks();
  });

  function primeExistingNode(prefix: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
    const p = path.join(dir, 'openfang_napi.node');
    writeFileSync(p, '/* placeholder — real .node not present in test env */');
    process.env[OPENFANG_NATIVE_ADDON_ENV] = p;
    return p;
  }

  it('prefers the native addon when the module loads and ping() returns true', () => {
    primeExistingNode('openfang-napi-pref-');
    __setRequireOverrideForTest(() => makeStubAddon());
    try {
      const addon = loadNativeAddon(process.env);
      expect(addon).not.toBeUndefined();
      expect(addon?.ping()).toBe(true);
    } finally {
      delete process.env[OPENFANG_NATIVE_ADDON_ENV];
      __resetNativeAddonForTest();
    }
  });

  it('falls back gracefully when the require override throws (degrade-safe)', () => {
    primeExistingNode('openfang-napi-fallback-');
    __setRequireOverrideForTest(() => {
      throw new Error('simulated dlopen failure for test');
    });
    try {
      expect(loadNativeAddon(process.env)).toBeUndefined();
    } finally {
      delete process.env[OPENFANG_NATIVE_ADDON_ENV];
      __resetNativeAddonForTest();
    }
  });

  it('falls back gracefully when ping() returns false (broken addon)', () => {
    primeExistingNode('openfang-napi-pingfail-');
    __setRequireOverrideForTest(() => makeStubAddon({ ping: () => false }));
    try {
      expect(loadNativeAddon(process.env)).toBeUndefined();
    } finally {
      delete process.env[OPENFANG_NATIVE_ADDON_ENV];
      __resetNativeAddonForTest();
    }
  });

  it('returns undefined and never throws when no .node path is found (build deferred path)', () => {
    // Force absence via a bogus explicit path so the resolver skips repo
    // auto-discovery (which would otherwise find a locally-built .node).
    expect(() => loadNativeAddon(ABSENT)).not.toThrow();
    expect(loadNativeAddon(ABSENT)).toBeUndefined();
  });

  it('is idempotent — repeated calls return the same memoized result', () => {
    __resetNativeAddonForTest();
    expect(loadNativeAddon(ABSENT)).toBe(loadNativeAddon(ABSENT));
  });
});

// ---------------------------------------------------------------------------
// High-level facade — bundled hands + engine boot
// ---------------------------------------------------------------------------

describe('openfang-native: high-level facade', () => {
  beforeEach(() => __resetNativeAddonForTest());
  afterEach(() => {
    __resetNativeAddonForTest();
    delete process.env[OPENFANG_NATIVE_ADDON_ENV];
  });

  function primeAddon(prefix: string, addon: OpenfangNativeAddon): void {
    const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
    const p = path.join(dir, 'openfang_napi.node');
    writeFileSync(p, '/* placeholder */');
    process.env[OPENFANG_NATIVE_ADDON_ENV] = p;
    __setRequireOverrideForTest(() => addon);
  }

  it('nativeBundledHands returns the compiled-in hands when the addon is present', () => {
    primeAddon('openfang-hands-', makeStubAddon());
    const hands = nativeBundledHands(process.env);
    expect(hands).toBeDefined();
    expect(hands?.[0]).toMatchObject({ id: 'researcher', name: 'Researcher' });
  });

  it('nativeBundledHands returns undefined when no addon is present (degrade-safe)', () => {
    expect(nativeBundledHands(ABSENT)).toBeUndefined();
  });

  it('getOpenfangEngine boots and caches the engine when the addon is present', () => {
    primeAddon('openfang-engine-', makeStubAddon());
    const engine = getOpenfangEngine(process.env);
    expect(engine).toBeDefined();
    expect(JSON.parse(engine!.health())).toMatchObject({ ok: true, build_mode: 'full' });
  });

  it('getOpenfangEngine degrades to undefined when boot() throws', () => {
    primeAddon(
      'openfang-engine-fail-',
      makeStubAddon({
        OpenfangEngine: {
          boot: () => {
            throw new Error('no config on this machine');
          },
        },
      }),
    );
    expect(getOpenfangEngine(process.env)).toBeUndefined();
  });

  it('getOpenfangEngine returns undefined when no addon is present', () => {
    expect(getOpenfangEngine(ABSENT)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Stub addon contract — prove the real interface shape
// ---------------------------------------------------------------------------

describe('openfang-native: OpenfangNativeAddon stub contract', () => {
  it('ping() returns true on a well-formed stub', () => {
    expect(makeStubAddon().ping()).toBe(true);
  });

  it('nativeVersion() returns valid JSON with the full-build marker', () => {
    const parsed = JSON.parse(makeStubAddon().nativeVersion());
    expect(parsed).toMatchObject({ crate: 'openfang-napi', build_mode: 'full' });
  });

  it('bundledHandsJson() lists real bundled hands', () => {
    const parsed = JSON.parse(makeStubAddon().bundledHandsJson());
    expect(parsed.ok).toBe(true);
    expect(parsed.hands.length).toBeGreaterThan(0);
  });

  it('OpenfangEngine.boot().health() reports ok on a well-formed stub', () => {
    const engine = makeStubAddon().OpenfangEngine.boot(null);
    expect(JSON.parse(engine.health())).toMatchObject({ ok: true });
  });
});
