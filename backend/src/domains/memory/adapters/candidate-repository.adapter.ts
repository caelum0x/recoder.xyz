/**
 * candidate-repository.adapter — the concrete `MemoryRepository`.
 *
 * Ownership split (conflict #3): items + candidates live in agent-os-owned
 * tables, so those methods DELEGATE to the injected `MemoryCandidateItemStore`
 * (the narrow agent-os repository slice) — this domain never opens a parallel
 * store. The NEW `memory_relations` table is memory-owned, so the relation
 * methods run parameterized `:param` SQL through the persistence `QueryExecutor`
 * with an app-layer `WHERE user_id = :user_id` guard (no Supabase RLS).
 *
 * DEGRADE-SAFE: reads over an unconfigured pool return `[]`/`null`; relation
 * WRITES over an unconfigured pool throw a truthful error (a gated write must not
 * silently claim success). Item/candidate delegation inherits the store's own
 * degrade behavior.
 */
import type { MemoryItem, MemoryCandidate } from '@recoder/agent-os';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type {
  MemoryCandidateItemStore,
  MemoryRepository,
  RelationInput,
} from '../ports/memory-repository.port.js';
import { isRelationKind, type MemoryRelation } from '../types.js';

/** A raw `memory_relations` row as returned by the executor. */
type RelationRow = Record<string, unknown> & {
  readonly relation_id: string;
  readonly user_id: string;
  readonly from_memory_id: string;
  readonly to_memory_id: string;
  readonly kind: string;
  readonly created_at: string | Date;
};

function toRelation(row: RelationRow): MemoryRelation {
  const kind = isRelationKind(row.kind) ? row.kind : 'relates-to';
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  return {
    relationId: row.relation_id,
    userId: row.user_id,
    fromMemoryId: row.from_memory_id,
    toMemoryId: row.to_memory_id,
    kind,
    createdAt,
  };
}

/** Best-effort UUID (crypto.randomUUID with a timestamp fallback). */
function newId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    // fall through
  }
  return `rel_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export interface MemoryRepositoryDeps {
  /** The persistence `:param` executor (owns `memory_relations`). */
  readonly query: QueryExecutor;
  /** The agent-os repository slice that owns items + candidates. */
  readonly store: MemoryCandidateItemStore;
}

/**
 * Build the memory repository. Item/candidate methods delegate to the agent-os
 * store (filtering by `scope` client-side where the store is unscoped); relation
 * methods own `memory_relations`.
 */
export function createMemoryRepository(deps: MemoryRepositoryDeps): MemoryRepository {
  const { query, store } = deps;

  return {
    // — Items + candidates (agent-os-owned) —
    async listItems(_userId: string): Promise<readonly MemoryItem[]> {
      return await store.listMemoryItems();
    },

    async getItem(_userId: string, memoryId: string): Promise<MemoryItem | null> {
      const items = await store.listMemoryItems();
      return items.find((i) => i.memoryId === memoryId) ?? null;
    },

    async upsertItem(_userId: string, item: MemoryItem): Promise<MemoryItem> {
      return await store.upsertMemoryItem(item);
    },

    async listCandidates(_userId: string, scope?: string): Promise<readonly MemoryCandidate[]> {
      const all = await store.listMemoryCandidates();
      return scope ? all.filter((c) => c.scope === scope) : all;
    },

    async getCandidate(_userId: string, candidateId: string): Promise<MemoryCandidate | null> {
      const all = await store.listMemoryCandidates();
      return all.find((c) => c.candidateId === candidateId) ?? null;
    },

    async upsertCandidate(_userId: string, candidate: MemoryCandidate): Promise<MemoryCandidate> {
      return await store.upsertMemoryCandidate(candidate);
    },

    // — Relations (memory-owned `memory_relations`) —
    async addRelation(input: RelationInput): Promise<MemoryRelation> {
      if (!query.isAvailable()) {
        throw new Error('cannot persist memory relation: persistence pool unavailable');
      }
      const relationId = newId();
      // Idempotent on the UNIQUE(from, to, kind) constraint; on conflict we read
      // back the existing edge so the caller always gets a persisted row.
      const inserted = await query.one<RelationRow>(
        `INSERT INTO memory_relations (relation_id, user_id, from_memory_id, to_memory_id, kind)
         VALUES (:relation_id, :user_id, :from_memory_id, :to_memory_id, :kind)
         ON CONFLICT (from_memory_id, to_memory_id, kind) DO NOTHING
         RETURNING relation_id, user_id, from_memory_id, to_memory_id, kind, created_at`,
        {
          relation_id: relationId,
          user_id: input.userId,
          from_memory_id: input.fromMemoryId,
          to_memory_id: input.toMemoryId,
          kind: input.kind,
        },
      );
      if (inserted) return toRelation(inserted);

      const existing = await query.one<RelationRow>(
        `SELECT relation_id, user_id, from_memory_id, to_memory_id, kind, created_at
           FROM memory_relations
          WHERE from_memory_id = :from_memory_id
            AND to_memory_id = :to_memory_id
            AND kind = :kind
            AND user_id = :user_id`,
        {
          from_memory_id: input.fromMemoryId,
          to_memory_id: input.toMemoryId,
          kind: input.kind,
          user_id: input.userId,
        },
      );
      if (existing) return toRelation(existing);
      // Should not happen (insert did nothing yet no row exists) — surface truth.
      throw new Error('memory relation upsert did not persist');
    },

    async listRelations(userId: string, fromMemoryId: string): Promise<readonly MemoryRelation[]> {
      if (!query.isAvailable()) return [];
      const rows = await query.read<RelationRow>(
        `SELECT relation_id, user_id, from_memory_id, to_memory_id, kind, created_at
           FROM memory_relations
          WHERE user_id = :user_id AND from_memory_id = :from_memory_id
          ORDER BY created_at ASC`,
        { user_id: userId, from_memory_id: fromMemoryId },
      );
      return rows.map(toRelation);
    },

    async deleteRelation(userId: string, relationId: string): Promise<boolean> {
      if (!query.isAvailable()) {
        throw new Error('cannot delete memory relation: persistence pool unavailable');
      }
      const affected = await query.mutate(
        `DELETE FROM memory_relations WHERE relation_id = :relation_id AND user_id = :user_id`,
        { relation_id: relationId, user_id: userId },
      );
      return affected > 0;
    },
  };
}
