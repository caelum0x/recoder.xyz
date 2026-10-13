import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuditEntry, AuditInput } from '../domain/audit-entry';
import { GENESIS_PREV_HASH, sealEntry, verifyIntegrity, type IntegrityResult } from './merkle-verifier';
import { AuditTamperError } from '../errors';

/**
 * FileAuditLog — a durable, append-only, hash-chained audit log persisted as
 * newline-delimited JSON (JSONL) on disk.
 *
 * `InMemoryAuditStore` (audit-store.ts) is the in-process Merkle chain used
 * when the Rust daemon is down; it is REAL but it does not survive a process
 * restart. `FileAuditLog` is the durable companion the command-gate seam needs:
 * every decision an agent's command gate makes (verdict, approval request,
 * approval resolution, execution outcome) is appended to this file the moment
 * it happens, synchronously, so a crash immediately after a decision still
 * leaves the trail on disk.
 *
 * Append-only by construction:
 *   - There is no update/delete method. The only mutation is `append`, which
 *     always writes a NEW line after the current tip.
 *   - On construction, any existing file is read back and its chain is
 *     verified. A tampered or truncated file throws `AuditTamperError`
 *     immediately rather than silently accepting a broken history.
 *   - `append` uses `fs.appendFileSync` with the `'a'` flag (never `'w'`), so a
 *     concurrent process cannot truncate this log out from under us, and a
 *     restart resumes the SAME chain instead of starting a new genesis.
 */
export class FileAuditLog {
  private readonly path: string;
  private entries: AuditEntry[];

  private constructor(path: string, entries: AuditEntry[]) {
    this.path = path;
    this.entries = entries;
  }

  /**
   * Open (or create) the audit log file at `path`. When the file already
   * exists, its entries are loaded and the chain is verified; a broken chain
   * throws `AuditTamperError` so the caller never treats tampered history as
   * trustworthy. When the file does not exist, its parent directory is
   * created and the log starts empty (the next `append` seals the genesis
   * entry).
   */
  static open(path: string): FileAuditLog {
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      return new FileAuditLog(path, []);
    }

    const entries = loadEntries(path);
    const result = verifyIntegrity(entries);
    if (!result.ok) {
      throw new AuditTamperError(
        `Audit log '${path}' failed integrity verification: ${result.reason}`,
        result.brokenAtSeq,
        { path },
      );
    }
    return new FileAuditLog(path, entries);
  }

  /** Append a new entry, sealing it against the current on-disk tip. */
  append(input: AuditInput): AuditEntry {
    const seq = this.entries.length;
    const prevHash = seq === 0 ? GENESIS_PREV_HASH : this.entries[seq - 1].hash;
    const entry = sealEntry(input, seq, prevHash);
    // One JSON object per line; 'a' flag only ever extends the file.
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', flag: 'a' });
    this.entries = [...this.entries, entry];
    return entry;
  }

  /** Current Merkle tip hash, or the genesis sentinel when empty. */
  tipHash(): string {
    return this.entries.length === 0 ? GENESIS_PREV_HASH : this.entries[this.entries.length - 1].hash;
  }

  length(): number {
    return this.entries.length;
  }

  /** A defensive copy of the full on-disk chain (newest last). */
  all(): readonly AuditEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  /** Entries for a single run, in order. */
  forRun(runId: string): readonly AuditEntry[] {
    return this.entries.filter((entry) => entry.runId === runId).map((entry) => ({ ...entry }));
  }

  /**
   * Re-read the file from disk and verify its integrity. Use this to detect
   * out-of-band tampering (e.g. a separate process or a text editor touched
   * the file) between appends, rather than trusting the in-memory cache.
   */
  verify(): IntegrityResult {
    const onDisk = loadEntries(this.path);
    return verifyIntegrity(onDisk);
  }

  /** The file path backing this log. */
  filePath(): string {
    return this.path;
  }
}

function loadEntries(path: string): AuditEntry[] {
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as AuditEntry;
    } catch (err) {
      throw new AuditTamperError(
        `Audit log '${path}' has an unparseable line at index ${i}`,
        i,
        { path, cause: err instanceof Error ? err.message : String(err) },
      );
    }
  });
}
