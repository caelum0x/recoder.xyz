import {
  createDependencyGraphSnapshot,
  restoreDependencyGraphSnapshot,
  type DependencyGraph,
  type DependencyGraphSnapshot,
} from '@recoder/recodergit';
import type { PermissiveImpactSnapshotStore } from './permissive-code-search.js';
import type { RecoderGitStateKv } from './recodergit-index-state.store.js';

export const RECODERGIT_GRAPH_SNAPSHOT_NAMESPACE = 'engines.recodergit.graph-snapshot';
const STORE_SCHEMA_VERSION = 1 as const;

type StoredGraphSnapshot = {
  version: typeof STORE_SCHEMA_VERSION;
  repoId: string;
  snapshot: DependencyGraphSnapshot;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Reject another repo, another revision, and corrupt graph data. */
export function parseStoredGraphSnapshot(
  value: unknown,
  expected: { repoId: string; repoRoot: string; revision: string },
): DependencyGraph | null {
  const envelope = record(value);
  if (envelope?.['version'] !== STORE_SCHEMA_VERSION || envelope['repoId'] !== expected.repoId) return null;
  return restoreDependencyGraphSnapshot(envelope['snapshot'], {
    repoRoot: expected.repoRoot,
    revision: expected.revision,
  });
}

/** Canonical installed-app KV adapter for packaged RecoderGit graph snapshots. */
export function createRecoderGitGraphSnapshotStore(
  kv: RecoderGitStateKv,
): PermissiveImpactSnapshotStore {
  const memory = new Map<string, StoredGraphSnapshot>();

  async function persist(input: {
    repoId: string;
    repoRoot: string;
    revision: string;
    graph: DependencyGraph;
  }): Promise<void> {
    const stored: StoredGraphSnapshot = {
      version: STORE_SCHEMA_VERSION,
      repoId: input.repoId,
      snapshot: createDependencyGraphSnapshot(input.graph, input.revision),
    };
    memory.set(input.repoId, stored);
    try {
      await kv.setJson(RECODERGIT_GRAPH_SNAPSHOT_NAMESPACE, input.repoId, stored);
    } catch {
      // The live process keeps serving its graph; restart durability is best-effort.
    }
  }

  return {
    async get(input): Promise<DependencyGraph | null> {
      const candidates = [input.repoId, ...(input.repoAliases ?? [])];
      for (const candidate of candidates) {
        const expected = { ...input, repoId: candidate };
        let parsed: DependencyGraph | null = null;
        try {
          const stored = await kv.getJson<unknown>(RECODERGIT_GRAPH_SNAPSHOT_NAMESPACE, candidate);
          parsed = parseStoredGraphSnapshot(stored, expected);
        } catch {
          // Fall through to the current process mirror during a transient KV fault.
        }
        parsed ??= parseStoredGraphSnapshot(memory.get(candidate), expected);
        if (!parsed) continue;
        if (candidate !== input.repoId) {
          await persist({ ...input, graph: parsed });
        }
        return parsed;
      }
      return null;
    },
    async set(input): Promise<void> {
      await persist(input);
    },
  };
}
