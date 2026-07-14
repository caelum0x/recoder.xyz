import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the OWNED `bd` binary resolver. All filesystem probes are
 * mocked so the resolution ORDER (BEADS_BIN env → owned repo build → PATH)
 * and the degrade-safe undefined are proven without any real bd install.
 */
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

import { existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { resolveBeadsBin, BEADS_BIN_ENV } from './beads-bin.js';

const existsSyncMock = vi.mocked(existsSync);

/** existsSync stub that answers true only for paths ending in one of `suffixes`. */
function existsFor(...suffixes: string[]): void {
  existsSyncMock.mockImplementation((p) =>
    suffixes.some((s) => String(p).endsWith(s)),
  );
}

const GO_MOD = join('apps', 'desktop', 'server', 'engines', 'beads', 'go.mod');
const OWNED_BIN = join('apps', 'desktop', 'server', 'engines', 'beads', 'bin', 'bd');
const MAKEFILE_BIN = join('apps', 'desktop', 'server', 'engines', 'beads', 'bd');

describe('resolveBeadsBin', () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(false);
  });

  it('prefers an existing BEADS_BIN env path over everything else', () => {
    existsFor('/opt/beads/bd', GO_MOD, OWNED_BIN);
    const env = { [BEADS_BIN_ENV]: '/opt/beads/bd', PATH: '/usr/local/bin' };
    expect(resolveBeadsBin(env)).toBe('/opt/beads/bd');
  });

  it('returns undefined when BEADS_BIN is set but missing (no silent fall-through)', () => {
    // Owned binary AND a PATH bd exist, but the explicit override is broken:
    // an explicit-but-wrong config must surface as unavailable, not swap binaries.
    existsFor(GO_MOD, OWNED_BIN, join('/usr/local/bin', 'bd'));
    const env = { [BEADS_BIN_ENV]: '/nope/bd', PATH: '/usr/local/bin' };
    expect(resolveBeadsBin(env)).toBeUndefined();
  });

  it('resolves the owned repo build apps/desktop/server/engines/beads/bin/bd when no env override is set', () => {
    existsFor(GO_MOD, OWNED_BIN);
    const resolved = resolveBeadsBin({ PATH: '' });
    expect(resolved).toBeDefined();
    expect(resolved!.endsWith(OWNED_BIN)).toBe(true);
  });

  it('falls back to the vendored Makefile output apps/desktop/server/engines/beads/bd', () => {
    existsFor(GO_MOD, MAKEFILE_BIN);
    const resolved = resolveBeadsBin({ PATH: '' });
    expect(resolved).toBeDefined();
    expect(resolved!.endsWith(MAKEFILE_BIN)).toBe(true);
    expect(resolved!.endsWith(OWNED_BIN)).toBe(false);
  });

  it('prefers the owned repo build over a bd found on PATH', () => {
    existsFor(GO_MOD, OWNED_BIN, join('/usr/local/bin', 'bd'));
    const resolved = resolveBeadsBin({ PATH: '/usr/local/bin' });
    expect(resolved).toBeDefined();
    expect(resolved!.endsWith(OWNED_BIN)).toBe(true);
  });

  it('returns bare "bd" when only a PATH install exists (spawn semantics unchanged)', () => {
    existsFor(join('/usr/local/bin', 'bd'));
    const env = { PATH: ['/does/not/matter', '/usr/local/bin'].join(delimiter) };
    expect(resolveBeadsBin(env)).toBe('bd');
  });

  it('degrades to undefined when nothing is found anywhere', () => {
    // mock default: existsSync always false
    expect(resolveBeadsBin({ PATH: '/usr/local/bin' })).toBeUndefined();
  });

  it('degrades to undefined with an empty/absent PATH', () => {
    expect(resolveBeadsBin({})).toBeUndefined();
  });
});
