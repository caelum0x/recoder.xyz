/**
 * `AuditRepository` — the persistence contract for the tamper-evident Merkle
 * audit chain (`governance_audit`, append-only). Declared here; the concrete pg
 * impl (`repositories/audit.repository.ts`) is built over the persistence
 * `QueryExecutor`.
 *
 * The chain invariant: `entry_hash = SHA-256(prev_hash || '|' || canonical(fields))`,
 * chained from {@link AUDIT_GENESIS_HASH}. Appending must read the current tip
 * and insert the new sealed entry ATOMICALLY (serialized) so two concurrent
 * appends can never fork the chain. That atomicity lives in the repository (it
 * owns the transaction); the caller supplies the sealer that computes the hash
 * from the just-read tip.
 */
import type { AuditEntryInput, AuditRecord, AuditVerification } from '../types.js';

/**
 * Computes an entry hash from the current tip + the unsealed entry. Provided by
 * `AuditChainService`; called INSIDE the repository's serialized append
 * transaction with the freshly-read `prevHash` so the seal is never stale.
 */
export type AuditSealer = (prevHash: string, entry: AuditEntryInput) => string;

/** A page over the durable chain. */
export interface AuditRangeQuery {
  /** Inclusive lower `seq` bound. */
  readonly fromSeq?: number;
  /** Inclusive upper `seq` bound. */
  readonly toSeq?: number;
  /** Restrict to a single actor (actor-scoped reads). */
  readonly actorId?: string;
  /**
   * Restrict to entries whose sealed `payload.workspaceId` equals this id — the
   * per-workspace audit trail read (conductor merge/pr/advance seal `workspaceId`
   * into `payload`). Filters on `payload->>'workspaceId'`; never mutates the chain.
   */
  readonly workspaceId?: string;
  /** Max rows (default bounded by the impl). */
  readonly limit?: number;
}

export interface AuditRepository {
  /**
   * Atomically: lock the chain, read the tip (`prevHash`, or genesis when
   * empty), `seal(prevHash, entry)` to compute the entry hash, insert the sealed
   * row, and return the persisted {@link AuditRecord}. Serialized so the chain
   * never forks under concurrency.
   */
  append(entry: AuditEntryInput, seal: AuditSealer): Promise<AuditRecord>;

  /** The current chain tip (highest `seq`), or `null` when the chain is empty. */
  tip(): Promise<AuditRecord | null>;

  /** A page of the chain, ordered by ascending `seq`. */
  range(query?: AuditRangeQuery): Promise<readonly AuditRecord[]>;

  /**
   * Re-walk the whole chain in `seq` order, re-deriving each `entry_hash` via the
   * provided `seal` and checking it against the stored hash + that each row's
   * `prev_hash` equals the previous row's `entry_hash`. Detects any in-place
   * mutation, reordering, or gap. Returns the break `seq` on failure.
   */
  verifyChain(seal: AuditSealer): Promise<AuditVerification>;
}
