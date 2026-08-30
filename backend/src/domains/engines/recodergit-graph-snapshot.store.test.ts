import { buildDependencyGraph, type DependencyGraph } from '@recoder/recodergit';
import { describe, expect, it } from 'vitest';
import { createPermissiveImpactFallback } from './permissive-code-search.js';
import {
  createRecoderGitGraphSnapshotStore,
  RECODERGIT_GRAPH_SNAPSHOT_NAMESPACE,
} from './recodergit-graph-snapshot.store.js';
import {
  createRecoderGitIndexStateStore,
  RECODERGIT_INDEX_STATE_NAMESPACE,
  type RecoderGitStateKv,
} from './recodergit-index-state.store.js';
import { createRecoderGitService, type IndexState } from './recodergit-service.js';

function memoryKv(): RecoderGitStateKv & { rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  const key = (namespace: string, id: string) => `${namespace}:${id}`;
  return {
    rows,
    getJson: async <T>(namespace: string, id: string): Promise<T | null> =>
      (rows.get(key(namespace, id)) as T | undefined) ?? null,
    setJson: async (namespace, id, value) => void rows.set(key(namespace, id), value),
  };
}

const repoId = 'owner__repo';
const repoRoot = '/work/repo';
const revision = 'abc123';
const state: IndexState = {
  repoId,
  repoRoot,
  branch: 'main',
  lastIndexedSha: revision,
  indexedAt: '2026-08-30T12:00:00.000Z',
  nodes: 2,
  edges: 1,
  status: 'indexed',
};

function graph(): DependencyGraph {
  return buildDependencyGraph(
    repoRoot,
    ['leaf.ts', 'middle.ts'],
    [{ from: 'middle.ts', to: 'leaf.ts' }],
    state.indexedAt,
    {
      symbols: [
        { filePath: 'leaf.ts', name: 'leaf', kind: 'function' },
        { filePath: 'middle.ts', name: 'middle', kind: 'function' },
      ],
      symbolCalls: [{
        from: 'middle.ts',
        to: 'leaf.ts',
        caller: 'middle',
        callee: 'leaf',
        confidence: 1,
      }],
      processes: [{
        id: 'server:middle.ts',
        label: 'Server middle.ts',
        processType: 'server',
        filePath: 'middle.ts',
      }],
      coChanges: [{
        left: 'leaf.ts',
        right: 'middle.ts',
        commits: 3,
        confidence: 0.75,
      }],
    },
  );
}

function service(
  kv: RecoderGitStateKv,
  buildGraph: (root: string) => Promise<DependencyGraph>,
  headSha = revision,
  sourceRevision?: string,
) {
  return createRecoderGitService({
    isEnabled: () => true,
    loadEngineLib: async () => null,
    git: {
      headSha: async () => headSha,
      currentBranch: async () => 'main',
      ...(sourceRevision ? { sourceRevision: async () => sourceRevision } : {}),
    },
    store: createRecoderGitIndexStateStore(kv),
    fallbackImpact: createPermissiveImpactFallback({
      snapshotStore: createRecoderGitGraphSnapshotStore(kv),
      buildGraph,
    }),
  });
}

async function upstream(
  recoderGit: ReturnType<typeof service>,
  targetRepoId = repoId,
  repoAliases: readonly string[] = [],
) {
  return recoderGit.codeIntel('find_references', targetRepoId, {
    ...(repoAliases.length > 0 ? { repoAliases } : {}),
    symbol: 'leaf',
    filePath: 'leaf.ts',
    maxDepth: 3,
    limit: 20,
    includeTests: true,
  });
}

describe('installed RecoderGit graph snapshots', () => {
  it('hydrates a new service after restart without rescanning source', async () => {
    const kv = memoryKv();
    await createRecoderGitIndexStateStore(kv).set(repoId, state);
    let initialBuilds = 0;
    const beforeRestart = service(kv, async () => {
      initialBuilds += 1;
      return graph();
    });

    const first = await upstream(beforeRestart);
    expect(first).toMatchObject({
      enabled: true,
      available: true,
      result: { engine: 'permissive-mit', scope: 'symbol-call-graph' },
    });
    expect(initialBuilds).toBe(1);

    let restartBuilds = 0;
    const afterRestart = service(kv, async () => {
      restartBuilds += 1;
      throw new Error('a matching snapshot must make this unreachable');
    });
    const second = await upstream(afterRestart);

    expect(second).toMatchObject({
      enabled: true,
      available: true,
      result: {
        scope: 'symbol-call-graph',
        affected_processes: [{ label: 'Server middle.ts', processType: 'server' }],
        coChanges: [{ filePath: 'middle.ts', commits: 3, confidence: 0.75 }],
      },
    });
    expect(restartBuilds).toBe(0);
    expect(Object.values((second as { result: { byDepth: Record<number, Array<{ filePath: string }>> } }).result.byDepth)
      .flat().map((item) => item.filePath)).toEqual(['middle.ts']);
    expect([...kv.rows.keys()].sort()).toEqual([
      `${RECODERGIT_GRAPH_SNAPSHOT_NAMESPACE}:${repoId}`,
      `${RECODERGIT_INDEX_STATE_NAMESPACE}:${repoId}`,
    ]);
  });

  it('rebuilds when tracked or untracked worktree content changes under the same HEAD', async () => {
    const kv = memoryKv();
    await createRecoderGitIndexStateStore(kv).set(repoId, state);
    await upstream(service(kv, async () => graph(), revision, `${revision}:dirty-one`));

    let builds = 0;
    const changed = await upstream(service(kv, async () => {
      builds += 1;
      return graph();
    }, revision, `${revision}:dirty-two`));

    expect(changed).toMatchObject({ enabled: true, available: true });
    expect(builds).toBe(1);
    expect(kv.rows.get(`${RECODERGIT_GRAPH_SNAPSHOT_NAMESPACE}:${repoId}`)).toMatchObject({
      snapshot: { revision: `${revision}:dirty-two` },
    });
  });

  it('reuses and migrates legacy index state plus graph snapshots under the canonical id', async () => {
    const kv = memoryKv();
    const legacyId = 'repo';
    await createRecoderGitIndexStateStore(kv).set(legacyId, { ...state, repoId: legacyId });
    await upstream(service(kv, async () => graph()), legacyId);

    let rebuilds = 0;
    const canonical = service(kv, async () => {
      rebuilds += 1;
      throw new Error('legacy snapshot should be migrated instead of rebuilt');
    });
    const result = await upstream(canonical, repoId, [legacyId]);

    expect(result).toMatchObject({ enabled: true, available: true, repoId });
    expect(rebuilds).toBe(0);
    expect(kv.rows.get(`${RECODERGIT_INDEX_STATE_NAMESPACE}:${repoId}`)).toMatchObject({
      state: { repoId, repoRoot },
    });
    expect(kv.rows.get(`${RECODERGIT_GRAPH_SNAPSHOT_NAMESPACE}:${repoId}`)).toMatchObject({
      repoId,
      snapshot: { revision },
    });
  });
});
