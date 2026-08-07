/**
 * `MemoryRepository` — the persistence seam the memory domain binds to for the
 * reviewed candidate/item lifecycle AND the NEW relation edges.
 *
 * Ownership (conflict #3 resolution): the `memory_items` / `memory_candidates`
 * tables are owned by **agent-os** — this domain reaches them through the
 * agent-os repository port (`MemoryCandidateItemStore`, a narrow slice), never a
 * parallel store. The `memory_relations` table is owned by **memory**, so the
 * relation methods run `:param` SQL through the persistence `QueryExecutor`.
 *
 * Tenancy is app-layer (`WHERE user_id = :user_id`) — no Supabase RLS. Every
 * scoped read/write threads the caller's `userId`.
 */
import type { MemoryItem, MemoryCandidate } from '@recoder/agent-os';
import type { MemoryRelation, RelationKind } from '../types.js';

/**
 * The narrow slice of the agent-os repository the memory domain consumes for
 * items + candidates (agent-os owns these tables). Structurally satisfied by
 * `AgentOsRepositoryPort` (methods may be sync or async).
 */
export interface MemoryCandidateItemStore {
  listMemoryItems(): MemoryItem[] | Promise<MemoryItem[]>;
  upsertMemoryItem(memory: MemoryItem): MemoryItem | Promise<MemoryItem>;
  listMemoryCandidates(): MemoryCandidate[] | Promise<MemoryCandidate[]>;
  upsertMemoryCandidate(candidate: MemoryCandidate): MemoryCandidate | Promise<MemoryCandidate>;
}

/**
 * Read-time tenant-scope authorization for candidate reads. Candidates live in
 * the GLOBAL agent-os store, so a read must be constrained to the caller's own
 * `proposedBy` rows — omitting this context yields strict owner scoping. Either
 * flag lifts the filter (mirrors `space-authz`):
 *  - `privileged`: an `internal` service caller or an `admin`-scoped operator
 *  - `soloMode`: the desktop single-user plane (fail-open, never lock the owner out)
 */
export interface MemoryReadAuthz {
  readonly privileged?: boolean;
  readonly soloMode?: boolean;
}

/** A relation edge to insert (id + timestamp are assigned by the repository). */
export interface RelationInput {
  readonly userId: string;
  readonly fromMemoryId: string;
  readonly toMemoryId: string;
  readonly kind: RelationKind;
}

/**
 * The unified repository the memory composer + lifecycle depend on. Item and
 * candidate methods delegate to the agent-os store; relation methods own the
 * `memory_relations` table.
 */
export interface MemoryRepository {
  // — Items + candidates (agent-os-owned tables, tenant-filtered here) —
  listItems(userId: string, authz?: MemoryReadAuthz): Promise<readonly MemoryItem[]>;
  getItem(userId: string, memoryId: string): Promise<MemoryItem | null>;
  upsertItem(userId: string, item: MemoryItem): Promise<MemoryItem>;
  listCandidates(userId: string, scope?: string, authz?: MemoryReadAuthz): Promise<readonly MemoryCandidate[]>;
  getCandidate(userId: string, candidateId: string, authz?: MemoryReadAuthz): Promise<MemoryCandidate | null>;
  upsertCandidate(userId: string, candidate: MemoryCandidate): Promise<MemoryCandidate>;

  // — Relations (memory-owned `memory_relations` table) —
  addRelation(input: RelationInput): Promise<MemoryRelation>;
  listRelations(userId: string, fromMemoryId: string): Promise<readonly MemoryRelation[]>;
  deleteRelation(userId: string, relationId: string): Promise<boolean>;
}
