/**
 * `NapiLoader` degrade-safe contract:
 *  - an absent `.node` → `resolvePath` returns null + `load` returns null (no throw),
 *  - a present addon (injected via requireOverride) loads, validates, versions,
 *    and caches; a failing `validate` degrades to null,
 *  - a `require` that throws degrades to null (never propagates).
 */
import { tmpdir } from 'node:os';
import { describe, it, expect, vi } from 'vitest';
import { NapiLoader } from './napi-loader.js';
import type { NapiLoadSpec } from '../ports/napi-loader.port.js';

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as import('../../../shared/logger.js').Logger;

interface FakeAddon {
  ping(): boolean;
  version(): string;
}

const spec: NapiLoadSpec<FakeAddon> = {
  engineId: 'openfang',
  env: 'OPENFANG_NATIVE_ADDON',
  fileName: 'openfang_napi.node',
  crateDir: 'openfang',
  cratePackage: 'openfang-napi',
  validate: (addon) => addon.ping() === true,
  probeVersion: (addon) => addon.version(),
};

describe('NapiLoader (degrade-safe)', () => {
  it('resolves null and loads null when the .node is absent', () => {
    // Pin repoRoot at an existing dir with no `backend/engines/rust/**` under it,
    // so the loader cannot find a built addon (the real repo has one on-disk).
    const loader = new NapiLoader(log, { env: {}, repoRoot: tmpdir() });
    expect(loader.resolvePath(spec)).toBeNull();
    expect(loader.load(spec)).toBeNull();
  });

  it('loads + validates + versions + caches a present addon via requireOverride', () => {
    const addon: FakeAddon = { ping: () => true, version: () => '1.2.3' };
    const requireOverride = vi.fn(() => addon);
    const loader = new NapiLoader(log, {
      env: { OPENFANG_NATIVE_ADDON: '/tmp/openfang_napi.node' },
      requireOverride,
    });
    // resolvePath returns null for a non-existent explicit path — force the load
    // path by pointing at THIS test file (guaranteed to exist).
    const existingSpec = { ...spec, env: 'X_ADDON' };
    const loader2 = new NapiLoader(log, {
      env: { X_ADDON: __filename },
      requireOverride,
    });
    const loaded = loader2.load(existingSpec);
    expect(loaded).not.toBeNull();
    expect(loaded?.addon).toBe(addon);
    expect(loaded?.version).toBe('1.2.3');
    // cached: second load does not call require again.
    loader2.load(existingSpec);
    expect(requireOverride).toHaveBeenCalledTimes(1);
    // The unrelated loader with a missing path stays null.
    expect(loader.load(spec)).toBeNull();
  });

  it('degrades to null when validate() fails', () => {
    const addon: FakeAddon = { ping: () => false, version: () => '0' };
    const loader = new NapiLoader(log, {
      env: { X_ADDON: __filename },
      requireOverride: () => addon,
    });
    expect(loader.load({ ...spec, env: 'X_ADDON' })).toBeNull();
  });

  it('degrades to null when require throws (never propagates)', () => {
    const loader = new NapiLoader(log, {
      env: { X_ADDON: __filename },
      requireOverride: () => {
        throw new Error('dlopen failed: wrong arch');
      },
    });
    expect(loader.load({ ...spec, env: 'X_ADDON' })).toBeNull();
  });
});
