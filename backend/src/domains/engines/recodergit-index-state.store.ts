/**
 * Durable RecoderGit index-state adapter over Recoder's canonical installed-app
 * KV. This adapter preserves the repo/root/SHA/stats pointer that lets a
 * restarted backend report freshness instead of reverting to `not_indexed`.
 * The packaged file graph uses the sibling graph-snapshot adapter.
 */
import type { IndexState, IndexStateStore } from './recodergit-service.js';

export const RECODERGIT_INDEX_STATE_NAMESPACE = 'engines.recodergit.index-state';
const SCHEMA_VERSION = 1;

export interface RecoderGitStateKv {
  getJson<T>(namespace: string, key: string): Promise<T | null>;
  setJson<T>(namespace: string, key: string, value: T): Promise<void>;
}

type StoredIndexState = {
  version: typeof SCHEMA_VERSION;
  state: IndexState;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

/** Reject stale/corrupt KV payloads rather than inventing an indexed state. */
export function parseStoredIndexState(value: unknown, repoId: string): IndexState | null {
  const envelope = record(value);
  const row = record(envelope?.['state']);
  if (envelope?.['version'] !== SCHEMA_VERSION || !row) return null;
  const nodes = count(row['nodes']);
  const edges = count(row['edges']);
  const clusters = row['clusters'] === undefined ? undefined : count(row['clusters']);
  const flows = row['flows'] === undefined ? undefined : count(row['flows']);
  const branch = row['branch'];
  const lastIndexedSha = row['lastIndexedSha'];
  const cloneUrl = row['cloneUrl'];
  if (
    row['repoId'] !== repoId ||
    typeof row['repoRoot'] !== 'string' ||
    typeof row['indexedAt'] !== 'string' ||
    (branch !== null && typeof branch !== 'string') ||
    (lastIndexedSha !== null && typeof lastIndexedSha !== 'string') ||
    (row['status'] !== 'indexed' && row['status'] !== 'unavailable') ||
    nodes === null ||
    edges === null ||
    clusters === null ||
    flows === null ||
    (cloneUrl !== undefined && cloneUrl !== null && typeof cloneUrl !== 'string')
  ) return null;

  return {
    repoId,
    repoRoot: row['repoRoot'],
    branch,
    lastIndexedSha,
    indexedAt: row['indexedAt'],
    nodes,
    edges,
    ...(clusters !== undefined ? { clusters } : {}),
    ...(flows !== undefined ? { flows } : {}),
    status: row['status'],
    ...(cloneUrl !== undefined ? { cloneUrl } : {}),
  };
}

/**
 * Create the process-local + durable store. The memory mirror keeps the service
 * usable during a transient KV fault; a new backend instance hydrates from KV.
 */
export function createRecoderGitIndexStateStore(kv: RecoderGitStateKv): IndexStateStore {
  const memory = new Map<string, IndexState>();
  return {
    async get(repoId): Promise<IndexState | null> {
      try {
        const stored = await kv.getJson<unknown>(RECODERGIT_INDEX_STATE_NAMESPACE, repoId);
        const parsed = parseStoredIndexState(stored, repoId);
        if (parsed) {
          memory.set(repoId, parsed);
          return parsed;
        }
      } catch {
        // Canonical KV health reports the persistence impairment. Keep the last
        // process-local state available to product reads while it recovers.
      }
      return memory.get(repoId) ?? null;
    },
    async set(repoId, state): Promise<void> {
      memory.set(repoId, state);
      const stored: StoredIndexState = { version: SCHEMA_VERSION, state };
      try {
        await kv.setJson(RECODERGIT_INDEX_STATE_NAMESPACE, repoId, stored);
      } catch {
        // The service still owns a truthful in-process state. KV health exposes
        // the lost restart durability instead of turning indexing into a failure.
      }
    },
  };
}
