/**
 * herdr-path — resolution precedence + truthful absence.
 *
 * Proves the first-hit-wins ladder (env override → packaged resources → dev repo
 * build → PATH) and that an unresolved / explicit-but-broken lookup returns a
 * truthful `{ bin: null, reason }` rather than silently falling through.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveHerdrBin } from './herdr-path.js';

/** An `existsSync` that returns true only for the given set of absolute paths. */
function existsOnly(paths: readonly string[]): (p: string) => boolean {
  const set = new Set(paths);
  return (p: string) => set.has(p);
}

const MODULE_DIR = '/repo/backend/dist/domains/engines';
const DEV_ROOT = '/repo';
const DEV_CARGO = join(DEV_ROOT, 'apps', 'desktop', 'engines', 'herdr', 'Cargo.toml');
const DEV_BUILT = join(
  DEV_ROOT,
  'apps',
  'desktop',
  'engines',
  'herdr',
  'target',
  'release',
  'herdr'
);

describe('resolveHerdrBin', () => {
  it('prefers the CONDUCTOR_HERDR_BIN override when it exists', () => {
    const res = resolveHerdrBin(
      { CONDUCTOR_HERDR_BIN: '/pins/herdr' },
      { existsSync: existsOnly(['/pins/herdr', DEV_CARGO, DEV_BUILT]), moduleDir: MODULE_DIR }
    );
    expect(res).toEqual({ bin: '/pins/herdr', source: 'env' });
  });

  it('returns null with a reason when the override is set but missing (no silent fallthrough)', () => {
    const res = resolveHerdrBin(
      { CONDUCTOR_HERDR_BIN: '/pins/gone', PATH: '/usr/bin' },
      // Even though a PATH herdr and a dev build "exist", the broken explicit
      // override must NOT fall through to them.
      {
        existsSync: existsOnly(['/usr/bin/herdr', DEV_CARGO, DEV_BUILT]),
        moduleDir: MODULE_DIR,
      }
    );
    expect(res.bin).toBeNull();
    expect(res.source).toBe('none');
    expect(res.reason).toMatch(/CONDUCTOR_HERDR_BIN/);
    expect(res.reason).toMatch(/\/pins\/gone/);
  });

  it('resolves the packaged desktop resource via resourcesPath', () => {
    const packaged = join('/Resources', 'backend', 'engines', 'herdr', 'herdr');
    const res = resolveHerdrBin(
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
    const distRel = join(MODULE_DIR, '..', '..', '..', 'engines', 'herdr', 'herdr');
    const res = resolveHerdrBin(
      {},
      { existsSync: existsOnly([distRel]), moduleDir: MODULE_DIR }
    );
    expect(res).toEqual({ bin: distRel, source: 'packaged' });
  });

  it('resolves the dev repo build (cargo release) via the bounded ancestor-walk', () => {
    const res = resolveHerdrBin(
      {},
      { existsSync: existsOnly([DEV_CARGO, DEV_BUILT]), moduleDir: MODULE_DIR }
    );
    expect(res).toEqual({ bin: DEV_BUILT, source: 'dev' });
  });

  it('does not resolve dev when the source is present but the binary is unbuilt', () => {
    const res = resolveHerdrBin(
      {},
      // Cargo.toml present (repo found) but no target/release/herdr and no PATH herdr.
      { existsSync: existsOnly([DEV_CARGO]), moduleDir: MODULE_DIR }
    );
    expect(res.bin).toBeNull();
    expect(res.source).toBe('none');
  });

  it('falls back to the bare `herdr` on PATH (last resort)', () => {
    const res = resolveHerdrBin(
      { PATH: '/usr/bin:/opt/bin' },
      { existsSync: existsOnly(['/opt/bin/herdr']), moduleDir: MODULE_DIR }
    );
    expect(res).toEqual({ bin: 'herdr', source: 'path' });
  });

  it('returns a truthful null + reason when nothing resolves', () => {
    const res = resolveHerdrBin(
      { PATH: '/usr/bin' },
      { existsSync: existsOnly([]), moduleDir: MODULE_DIR }
    );
    expect(res.bin).toBeNull();
    expect(res.source).toBe('none');
    expect(res.reason).toMatch(/herdr binary not found/);
  });
});
