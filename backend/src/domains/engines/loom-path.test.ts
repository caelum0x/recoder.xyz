/**
 * loom-path — resolution precedence + truthful absence.
 *
 * Proves the first-hit-wins ladder (env override → packaged resources → dev repo
 * build → PATH) and that an unresolved / explicit-but-broken lookup returns a
 * truthful `{ bin: null, reason }` rather than silently falling through.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveLoomBin } from './loom-path.js';

/** An `existsSync` that returns true only for the given set of absolute paths. */
function existsOnly(paths: readonly string[]): (p: string) => boolean {
  const set = new Set(paths);
  return (p: string) => set.has(p);
}

const MODULE_DIR = '/repo/backend/dist/domains/engines';
const DEV_ROOT = '/repo';
const DEV_CARGO = join(DEV_ROOT, 'apps', 'desktop', 'engines', 'loom', 'Cargo.toml');
const DEV_BUILT = join(
  DEV_ROOT,
  'apps',
  'desktop',
  'engines',
  'loom',
  'target',
  'release',
  'loom'
);

describe('resolveLoomBin', () => {
  it('prefers the CONDUCTOR_LOOM_BIN override when it exists', () => {
    const res = resolveLoomBin(
      { CONDUCTOR_LOOM_BIN: '/pins/loom' },
      { existsSync: existsOnly(['/pins/loom', DEV_CARGO, DEV_BUILT]), moduleDir: MODULE_DIR }
    );
    expect(res).toEqual({ bin: '/pins/loom', source: 'env' });
  });

  it('returns null with a reason when the override is set but missing (no silent fallthrough)', () => {
    const res = resolveLoomBin(
      { CONDUCTOR_LOOM_BIN: '/pins/gone', PATH: '/usr/bin' },
      // Even though a PATH loom and a dev build "exist", the broken explicit
      // override must NOT fall through to them.
      {
        existsSync: existsOnly(['/usr/bin/loom', DEV_CARGO, DEV_BUILT]),
        moduleDir: MODULE_DIR,
      }
    );
    expect(res.bin).toBeNull();
    expect(res.source).toBe('none');
    expect(res.reason).toMatch(/CONDUCTOR_LOOM_BIN/);
    expect(res.reason).toMatch(/\/pins\/gone/);
  });

  it('resolves the packaged desktop resource via resourcesPath', () => {
    const packaged = join('/Resources', 'backend', 'engines', 'loom', 'loom');
    const res = resolveLoomBin(
      {},
      {
        existsSync: existsOnly([packaged]),
        resourcesPath: '/Resources',
        moduleDir: MODULE_DIR,
      }
    );
    expect(res).toEqual({ bin: packaged, source: 'packaged' });
  });

  it('resolves the packaged desktop resource dist-relative (ELECTRON_RUN_AS_NODE child)', () => {
    // <resources>/backend/dist/domains/engines → three ups → <resources>/backend.
    const distRel = join(MODULE_DIR, '..', '..', '..', 'engines', 'loom', 'loom');
    const res = resolveLoomBin(
      {},
      { existsSync: existsOnly([distRel]), moduleDir: MODULE_DIR }
    );
    expect(res).toEqual({ bin: distRel, source: 'packaged' });
  });

  it('resolves the dev repo build (cargo release) via the bounded ancestor-walk', () => {
    const res = resolveLoomBin(
      {},
      { existsSync: existsOnly([DEV_CARGO, DEV_BUILT]), moduleDir: MODULE_DIR }
    );
    expect(res).toEqual({ bin: DEV_BUILT, source: 'dev' });
  });

  it('does not resolve dev when the source is present but the binary is unbuilt', () => {
    const res = resolveLoomBin(
      {},
      // Cargo.toml present (repo found) but no target/release/loom and no PATH loom.
      { existsSync: existsOnly([DEV_CARGO]), moduleDir: MODULE_DIR }
    );
    expect(res.bin).toBeNull();
    expect(res.source).toBe('none');
  });

  it('falls back to the bare `loom` on PATH (last resort)', () => {
    const res = resolveLoomBin(
      { PATH: '/usr/bin:/opt/bin' },
      { existsSync: existsOnly(['/opt/bin/loom']), moduleDir: MODULE_DIR }
    );
    expect(res).toEqual({ bin: 'loom', source: 'path' });
  });

  it('returns a truthful null + reason when nothing resolves', () => {
    const res = resolveLoomBin(
      { PATH: '/usr/bin' },
      { existsSync: existsOnly([]), moduleDir: MODULE_DIR }
    );
    expect(res.bin).toBeNull();
    expect(res.source).toBe('none');
    expect(res.reason).toMatch(/loom binary not found/);
  });
});
