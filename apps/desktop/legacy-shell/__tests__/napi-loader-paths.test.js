/**
 * napi-loader-paths.test.js
 *
 * Verifies that the NAPI addon path-resolution helpers produce the correct
 * candidate lists for:
 *   1. Packaged-app mode (process.resourcesPath set)
 *   2. RECODER_NATIVE_DIR env override
 *   3. Dev mode (__dirname / workspace-root derivation)
 *
 * This test exercises the path-building logic WITHOUT requiring the actual .node
 * binaries to be present — it only checks the candidate arrays, not whether
 * require() succeeds. That keeps the test runnable in any environment.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Helpers that mirror the production loader logic, extracted here so we can
// test the path-building function directly without loading the .ts source
// (the desktop test suite is plain JS / does not compile TS packages).
// ---------------------------------------------------------------------------

/**
 * Replicate the governance loader's buildCandidatePaths() logic so we can
 * unit-test it in isolation. Takes explicit overrides for the env values that
 * differ between dev and packaged mode.
 *
 * @param {{ nativeDir?: string, resourcesPath?: string, cjsDirname?: string }} opts
 * @returns {string[]}
 */
function buildGovernanceCandidates({ nativeDir, resourcesPath, cjsDirname } = {}) {
  const candidates = [];

  // 1. RECODER_NATIVE_DIR override
  if (nativeDir && nativeDir.trim()) {
    candidates.push(path.join(nativeDir.trim(), 'recoder-governance-napi.node'));
  }

  // 2. Electron packaged: resourcesPath/native/
  if (resourcesPath && typeof resourcesPath === 'string') {
    candidates.push(path.join(resourcesPath, 'native', 'recoder-governance-napi.node'));
  }

  // 3. Monorepo dev: __dirname → up 5 → workspace root
  if (cjsDirname) {
    const workspaceRoot = path.resolve(cjsDirname, '..', '..', '..', '..', '.');
    candidates.push(
      path.join(
        workspaceRoot,
        'crates',
        'recoder-governance',
        'target',
        'release',
        'recoder-governance-napi.node',
      ),
    );
  }

  // 4. Co-located
  candidates.push('recoder-governance-napi.node');

  return candidates;
}

/**
 * Replicate the lance loader's buildLanceCandidatePaths() logic.
 *
 * @param {{ nativeDir?: string, resourcesPath?: string, cjsDirname?: string }} opts
 * @returns {string[]}
 */
function buildLanceCandidates({ nativeDir, resourcesPath, cjsDirname } = {}) {
  const candidates = [];

  if (nativeDir && nativeDir.trim()) {
    candidates.push(path.join(nativeDir.trim(), 'lance_npm_bindings.node'));
  }

  if (resourcesPath && typeof resourcesPath === 'string') {
    candidates.push(path.join(resourcesPath, 'native', 'lance_npm_bindings.node'));
  }

  if (cjsDirname) {
    const workspaceRoot = path.resolve(cjsDirname, '..', '..', '..', '..', '.');
    candidates.push(
      path.join(
        workspaceRoot,
        'crates',
        'lance',
        'npm-bindings',
        'target',
        'release',
        'lance_npm_bindings.node',
      ),
    );
  }

  candidates.push('lance-npm-bindings.node');

  return candidates;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_RESOURCES_PATH = path.join(os.tmpdir(), 'RecorderApp', 'Contents', 'Resources');
const FAKE_NATIVE_DIR = path.join(os.tmpdir(), 'recoder-native-override');

// Simulate __dirname of packages/governance/src/napi/napi-loader.ts in the
// monorepo so we can compute what the workspace root would resolve to.
const FAKE_LOADER_DIRNAME = path.join(
  __dirname, // apps/desktop/__tests__
  '..', '..', // apps/
  '..', // repo root
  'packages', 'governance', 'src', 'napi',
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('governance NAPI loader — candidate path resolution', () => {
  it('includes resourcesPath/native/ as the first non-env candidate when packaged', () => {
    const candidates = buildGovernanceCandidates({ resourcesPath: FAKE_RESOURCES_PATH });
    const expected = path.join(FAKE_RESOURCES_PATH, 'native', 'recoder-governance-napi.node');
    expect(candidates).toContain(expected);
    // resourcesPath candidate must appear before the co-located fallback
    expect(candidates.indexOf(expected)).toBeLessThan(candidates.indexOf('recoder-governance-napi.node'));
  });

  it('puts RECODER_NATIVE_DIR candidate first when set', () => {
    const candidates = buildGovernanceCandidates({
      nativeDir: FAKE_NATIVE_DIR,
      resourcesPath: FAKE_RESOURCES_PATH,
    });
    const fromNativeDir = path.join(FAKE_NATIVE_DIR, 'recoder-governance-napi.node');
    const fromResourcesPath = path.join(FAKE_RESOURCES_PATH, 'native', 'recoder-governance-napi.node');
    expect(candidates[0]).toBe(fromNativeDir);
    expect(candidates.indexOf(fromNativeDir)).toBeLessThan(candidates.indexOf(fromResourcesPath));
  });

  it('always appends the co-located fallback as the last candidate', () => {
    const candidates = buildGovernanceCandidates({ resourcesPath: FAKE_RESOURCES_PATH });
    expect(candidates[candidates.length - 1]).toBe('recoder-governance-napi.node');
  });

  it('has no resourcesPath candidate when not packaged (no resourcesPath set)', () => {
    const candidates = buildGovernanceCandidates({ cjsDirname: FAKE_LOADER_DIRNAME });
    const anyResourcesPath = candidates.some((c) => c.includes('native') && c.endsWith('recoder-governance-napi.node') && !c.includes('crates'));
    // With no resourcesPath, the only 'native' segment should come from the
    // workspace crates/ path — not from a Resources/native/ packaged path.
    expect(anyResourcesPath).toBe(false);
  });

  it('generates a workspace-relative crates/ path from __dirname', () => {
    const candidates = buildGovernanceCandidates({ cjsDirname: FAKE_LOADER_DIRNAME });
    const cratesCandidate = candidates.find((c) => c.includes('crates') && c.includes('recoder-governance'));
    expect(cratesCandidate).toBeTruthy();
    expect(cratesCandidate).toMatch(/recoder-governance-napi\.node$/);
  });
});

describe('lance NAPI loader — candidate path resolution', () => {
  it('includes resourcesPath/native/ as a candidate when packaged', () => {
    const candidates = buildLanceCandidates({ resourcesPath: FAKE_RESOURCES_PATH });
    const expected = path.join(FAKE_RESOURCES_PATH, 'native', 'lance_npm_bindings.node');
    expect(candidates).toContain(expected);
  });

  it('puts RECODER_NATIVE_DIR candidate first when set', () => {
    const candidates = buildLanceCandidates({
      nativeDir: FAKE_NATIVE_DIR,
      resourcesPath: FAKE_RESOURCES_PATH,
    });
    const fromNativeDir = path.join(FAKE_NATIVE_DIR, 'lance_npm_bindings.node');
    expect(candidates[0]).toBe(fromNativeDir);
  });

  it('always appends the co-located fallback as the last candidate', () => {
    const candidates = buildLanceCandidates({ resourcesPath: FAKE_RESOURCES_PATH });
    expect(candidates[candidates.length - 1]).toBe('lance-npm-bindings.node');
  });

  it('generates a workspace-relative crates/ path from __dirname', () => {
    const candidates = buildLanceCandidates({ cjsDirname: FAKE_LOADER_DIRNAME });
    const cratesCandidate = candidates.find((c) => c.includes('crates') && c.includes('lance'));
    expect(cratesCandidate).toBeTruthy();
    expect(cratesCandidate).toMatch(/lance_npm_bindings\.node$/);
  });

  it('resourcesPath candidate appears before the co-located fallback', () => {
    const candidates = buildLanceCandidates({ resourcesPath: FAKE_RESOURCES_PATH });
    const fromResources = path.join(FAKE_RESOURCES_PATH, 'native', 'lance_npm_bindings.node');
    expect(candidates.indexOf(fromResources)).toBeLessThan(
      candidates.indexOf('lance-npm-bindings.node'),
    );
  });
});
