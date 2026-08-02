/**
 * `createInMemoryCheckpointStore` — the bounded in-process {@link CheckpointStorePort}.
 *
 * A bounded, degrade-truthful in-process store: checkpoint METADATA lives in a
 * `Map` keyed by checkpoint id, indexed per workspace for the list surface. It is
 * NOT durable (`isDurable()` returns `false`) — the git objects a checkpoint
 * points at ARE durable in the repo, but this metadata is lost on restart, and the
 * store never pretends otherwise. The module DEFAULT is the durable git-tag-backed
 * store (`git-checkpoint-store.adapter.ts`), which uses this store as its cache.
 *
 * Records are stored as-is (immutable snapshots); `listForWorkspace` returns a
 * fresh newest-first copy so callers cannot mutate the backing store.
 */
import type { CheckpointRecord, CheckpointStorePort } from '../ports/checkpoint-store.port.js';

/** Cap the retained checkpoints per workspace so a long-lived run cannot grow unbounded. */
const MAX_PER_WORKSPACE = 200;

/** Build the in-process checkpoint store (degrade-truthful; `isDurable():false`). */
export function createInMemoryCheckpointStore(): CheckpointStorePort {
  const byId = new Map<string, CheckpointRecord>();
  const byWorkspace = new Map<string, string[]>();

  async function save(record: CheckpointRecord): Promise<CheckpointRecord> {
    byId.set(record.checkpointId, record);
    const ids = byWorkspace.get(record.workspaceId) ?? [];
    if (!ids.includes(record.checkpointId)) {
      ids.push(record.checkpointId);
      // Evict the oldest over the cap (FIFO) — the git tags remain in the repo.
      while (ids.length > MAX_PER_WORKSPACE) {
        const evicted = ids.shift();
        if (evicted) byId.delete(evicted);
      }
      byWorkspace.set(record.workspaceId, ids);
    }
    return record;
  }

  async function get(checkpointId: string): Promise<CheckpointRecord | null> {
    return byId.get(checkpointId) ?? null;
  }

  async function listForWorkspace(workspaceId: string): Promise<readonly CheckpointRecord[]> {
    const ids = byWorkspace.get(workspaceId) ?? [];
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is CheckpointRecord => r !== undefined)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return {
    save,
    get,
    listForWorkspace,
    isDurable: () => false,
  };
}
