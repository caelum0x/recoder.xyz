/**
 * Path-resolution contract tests for the owned `bd` (beads) binary resolver.
 * The packaged desktop ships bd via electron-builder extraResources to
 * `<resources>/backend/engines/beads/bin/bd`; the resolver must find it there
 * (resourcesPath OR dist-relative, since the ELECTRON_RUN_AS_NODE child has no
 * resourcesPath) BEFORE ever falling back to a possibly DB-incompatible PATH bd.
 * Dev keeps the owned repo build; nothing found resolves to undefined
 * (degrade-safe — callers skip cleanly, no fabricated availability).
 */
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBeadsBin } from './beads-bin.js';

/** existsSync stub that only knows the given absolute paths. */
function existsOnly(...paths: string[]): (p: string) => boolean {
  const known = new Set(paths);
  return (p: string) => known.has(p);
}

const PACKAGED_RESOURCES = '/Applications/Recoder.app/Contents/Resources';
const PACKAGED_BD = join(PACKAGED_RESOURCES, 'backend', 'engines', 'beads', 'bin', 'bd');
const PACKAGED_MODULE_DIR = join(PACKAGED_RESOURCES, 'backend', 'dist', 'domains', 'engines');

const DEV_ROOT = '/repo';
const DEV_MODULE_DIR = join(DEV_ROOT, 'backend', 'src', 'domains', 'engines');
const DEV_GO_MOD = join(DEV_ROOT, 'apps', 'desktop', 'server', 'engines', 'beads', 'go.mod');
const DEV_BD = join(DEV_ROOT, 'apps', 'desktop', 'server', 'engines', 'beads', 'bin', 'bd');

describe('resolveBeadsBin', () => {
  it('BEADS_BIN env wins when the file exists', () => {
    const bin = resolveBeadsBin(
      { BEADS_BIN: '/explicit/bd' },
      { existsSync: existsOnly('/explicit/bd', PACKAGED_BD), moduleDir: PACKAGED_MODULE_DIR },
    );
    expect(bin).toBe('/explicit/bd');
  });

  it('BEADS_BIN set-but-missing resolves undefined — no silent fallthrough', () => {
    const bin = resolveBeadsBin(
      { BEADS_BIN: '/explicit/bd', PATH: '/usr/local/bin' },
      { existsSync: existsOnly(join('/usr/local/bin', 'bd')), moduleDir: PACKAGED_MODULE_DIR },
    );
    expect(bin).toBeUndefined();
  });

  it('packaged: resolves the extraResources bd via resourcesPath', () => {
    const bin = resolveBeadsBin(
      { PATH: '/usr/local/bin' },
      {
        existsSync: existsOnly(PACKAGED_BD, join('/usr/local/bin', 'bd')),
        resourcesPath: PACKAGED_RESOURCES,
        moduleDir: PACKAGED_MODULE_DIR,
      },
    );
    expect(bin).toBe(PACKAGED_BD);
  });

  it('packaged child without resourcesPath: resolves dist-relative (three ups from backend/dist/domains/engines)', () => {
    const bin = resolveBeadsBin(
      { PATH: '/usr/local/bin' },
      {
        existsSync: existsOnly(PACKAGED_BD, join('/usr/local/bin', 'bd')),
        resourcesPath: undefined,
        moduleDir: PACKAGED_MODULE_DIR,
      },
    );
    expect(bin).toBe(PACKAGED_BD);
  });

  it('packaged bd beats a PATH bd (DB-incompatible PATH bd must never win)', () => {
    const pathBd = join('/opt/homebrew/bin', 'bd');
    const bin = resolveBeadsBin(
      { PATH: '/opt/homebrew/bin' },
      {
        existsSync: existsOnly(PACKAGED_BD, pathBd),
        resourcesPath: PACKAGED_RESOURCES,
        moduleDir: PACKAGED_MODULE_DIR,
      },
    );
    expect(bin).toBe(PACKAGED_BD);
  });

  it('dev: resolves the owned repo build via the repo-root walk', () => {
    const bin = resolveBeadsBin(
      { PATH: '/usr/local/bin' },
      { existsSync: existsOnly(DEV_GO_MOD, DEV_BD, join('/usr/local/bin', 'bd')), moduleDir: DEV_MODULE_DIR },
    );
    expect(bin).toBe(DEV_BD);
  });

  it('falls back to the bare PATH name only when a PATH dir actually has bd', () => {
    const dirs = ['/usr/bin', '/opt/homebrew/bin'];
    const bin = resolveBeadsBin(
      { PATH: dirs.join(delimiter) },
      { existsSync: existsOnly(join('/opt/homebrew/bin', 'bd')), moduleDir: DEV_MODULE_DIR },
    );
    expect(bin).toBe('bd');
  });

  it('nothing anywhere resolves undefined (degrade-safe)', () => {
    const bin = resolveBeadsBin(
      { PATH: '/usr/bin' },
      { existsSync: () => false, moduleDir: DEV_MODULE_DIR },
    );
    expect(bin).toBeUndefined();
  });
});
