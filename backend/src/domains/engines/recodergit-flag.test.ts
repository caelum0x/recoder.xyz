/**
 * recodergit code-graph gate — DEFAULT-ON decision (GAP-AUDIT Wave 5).
 *
 * Proves the three-state posture of `readCodeGraphFlag`:
 *   unset / empty  → ON  (new workspaces index by default)
 *   explicit falsy → OFF (the preserved opt-out)
 *   anything else  → ON
 * and that `createRecoderGitService()` (no injected `isEnabled`) is enabled by
 * default while still degrading truthfully when the engine bin is unresolved.
 */
import { describe, it, expect } from 'vitest';
import {
  readCodeGraphFlag,
  createRecoderGitService,
  type IndexState,
  type IndexStateStore,
} from './recodergit-service.js';

/** Deterministic in-memory index-state store (no disk, no pg). */
function memoryStore(): IndexStateStore {
  const map = new Map<string, IndexState>();
  return { get: (id) => map.get(id) ?? null, set: (id, state) => void map.set(id, state) };
}

const ENV = 'RECODER_CODE_GRAPH_ENABLED';

describe('readCodeGraphFlag (default-on)', () => {
  it('is ON when the env var is unset', () => {
    expect(readCodeGraphFlag({})).toBe(true);
  });

  it('is ON when the env var is empty/whitespace', () => {
    expect(readCodeGraphFlag({ [ENV]: '' })).toBe(true);
    expect(readCodeGraphFlag({ [ENV]: '   ' })).toBe(true);
  });

  it('is OFF only for an explicit falsy token (case/space insensitive)', () => {
    for (const token of ['0', 'false', 'no', 'off', 'OFF', ' False ']) {
      expect(readCodeGraphFlag({ [ENV]: token })).toBe(false);
    }
  });

  it('is ON for the truthy tokens and any other non-falsy value', () => {
    for (const token of ['1', 'true', 'yes', 'on', 'enabled', 'anything']) {
      expect(readCodeGraphFlag({ [ENV]: token })).toBe(true);
    }
  });
});

describe('createRecoderGitService default enablement', () => {
  it('defaults to enabled (no injected isEnabled) yet degrades truthfully when analyze fails', async () => {
    // Injecting `exec` disables the in-process lib path (documented test seam), so
    // the injected exec stays authoritative and no real process/lib is touched.
    // A non-zero exit models an unbuilt/unavailable engine: enabled, but truthful.
    const service = createRecoderGitService({
      resolveBin: () => null,
      exec: async () => ({ stdout: '', stderr: 'not built', code: 1 }),
      git: { headSha: async () => null, currentBranch: async () => null },
      store: memoryStore(),
    });
    expect(service.isEnabled()).toBe(true);

    const result = await service.indexRepo({ repoRoot: '/tmp/repo', repoId: 'r1' });
    expect(result.enabled).toBe(true);
    if (result.enabled) {
      expect(result.state.status).toBe('unavailable');
    }
  });

  it('honors an explicit isEnabled override (opt-out still works)', () => {
    const service = createRecoderGitService({ isEnabled: () => false });
    expect(service.isEnabled()).toBe(false);
  });
});
