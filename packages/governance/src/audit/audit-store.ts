import type { AuditEntry, AuditInput } from '../domain/audit-entry';
import { GENESIS_PREV_HASH, sealEntry, verifyIntegrity, type IntegrityResult } from './merkle-verifier';
import { AuditNotFoundError } from '../errors';

/**
 * InMemoryAuditStore — an append-only, hash-chained audit log. This is the
 * pure-TS audit backbone used when the Rust daemon (with its SQLite-backed
 * AuditLog) is unavailable. It is REAL: every append advances the SHA-256 Merkle
 * tip, and the store can verify its own integrity and reconstruct a run.
 *
 * The store is append-only by construction — there is no mutate/delete API, so a
 * caller cannot rewrite history through this interface. (A direct array splice
 * by a malicious caller is exactly what `verifyIntegrity` is designed to catch.)
 */
export class InMemoryAuditStore {
  private readonly entries: AuditEntry[] = [];

  /** Append an entry, sealing it against the current tip. Returns its hash. */
  record(input: AuditInput): AuditEntry {
    const seq = this.entries.length;
    const prevHash = seq === 0 ? GENESIS_PREV_HASH : this.entries[seq - 1].hash;
    const entry = sealEntry(input, seq, prevHash);
    this.entries.push(entry);
    return entry;
  }

  /** Current Merkle tip hash, or the genesis sentinel when empty. */
  tipHash(): string {
    return this.entries.length === 0 ? GENESIS_PREV_HASH : this.entries[this.entries.length - 1].hash;
  }

  length(): number {
    return this.entries.length;
  }

  /** A defensive copy of the full chain (callers cannot mutate internal state). */
  all(): readonly AuditEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  /** Entry by sequence number. Throws AuditNotFoundError when absent. */
  at(seq: number): AuditEntry {
    const entry = this.entries[seq];
    if (!entry) {
      throw new AuditNotFoundError(`No audit entry at seq ${seq}`, { seq });
    }
    return { ...entry };
  }

  /** Most recent `n` entries (newest last). */
  recent(n: number): readonly AuditEntry[] {
    const start = Math.max(0, this.entries.length - n);
    return this.entries.slice(start).map((entry) => ({ ...entry }));
  }

  /** All entries for a run, in order. Used to reconstruct a replay frame stream. */
  forRun(runId: string): readonly AuditEntry[] {
    return this.entries.filter((entry) => entry.runId === runId).map((entry) => ({ ...entry }));
  }

  /** Verify the whole chain's integrity. */
  verify(): IntegrityResult {
    return verifyIntegrity(this.entries);
  }
}
