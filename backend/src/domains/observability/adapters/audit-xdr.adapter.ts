/**
 * `AuditXdrProjection` — a READ-ONLY, re-verified projection over the governance
 * Merkle audit chain (surfaced as an XDR-style query edge). It does NOT own the
 * audit chain — governance does. It *surfaces* it, and RE-VERIFIES the Merkle
 * proof (`gate.verifyAudit()`) BEFORE returning any row.
 *
 * TAMPER LAW: if the chain does not re-verify clean (`ok === false`), the query
 * returns `verified:false` with NO records and the broken seq — a tampered chain
 * must surface as an error/empty result, never as rows presented as if trustworthy.
 * If the verify seam itself is unavailable, the query fails with
 * `SERVICE_UNAVAILABLE` rather than returning unverified audit rows.
 *
 * The chain content is read through the injected {@link AuditReader} (a persistence
 * read seam over `governance_audit`); this adapter only filters + shapes what
 * governance verified. No new crypto — the verifier is governance's.
 */
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { XdrQuery, XdrRecord, XdrResult } from '../types.js';

/** The read seam over the durable audit rows (persistence-backed). */
export interface AuditReader {
  /** True when the underlying store is connectable (drives truthful availability). */
  isAvailable(): boolean;
  /**
   * Read audit rows most-recent-first, bounded by `limit`, optionally filtered.
   * The rows are NOT trusted until `gate.verifyAudit()` confirms the chain.
   */
  readAudit(query: XdrQuery): Promise<readonly XdrRecord[]>;
}

const MAX_LIMIT = 500;

export interface AuditXdrProjectionDeps {
  readonly gate: GovernanceGate;
  readonly reader: AuditReader;
}

export class AuditXdrProjection {
  constructor(private readonly deps: AuditXdrProjectionDeps) {}

  /**
   * Verify-then-project. Order matters: the Merkle chain is re-verified FIRST; only
   * a clean verification lets any row be returned. A broken chain ⇒ `verified:false`
   * + zero records + the `brokenAtSeq`. An unavailable verify seam ⇒ throws (the
   * route maps it to `SERVICE_UNAVAILABLE`).
   */
  async verifyAndProject(query: XdrQuery): Promise<XdrResult> {
    if (!this.deps.reader.isAvailable()) {
      throw new AuditUnavailableError('audit store unavailable');
    }

    let verification;
    try {
      verification = await this.deps.gate.verifyAudit();
    } catch (err) {
      throw new AuditUnavailableError(
        `audit verify seam unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const verifiedAt = new Date().toISOString();

    if (!verification.ok) {
      // TAMPER: never return rows as if trustworthy.
      return {
        verified: false,
        ...(verification.brokenAtSeq !== undefined ? { brokenAtSeq: verification.brokenAtSeq } : {}),
        records: [],
        entries: verification.entries,
        verifiedAt,
      };
    }

    const limit = Math.min(Math.max(1, query.limit ?? 100), MAX_LIMIT);
    const records = await this.deps.reader.readAudit({ ...query, limit });
    return {
      verified: true,
      records: records.slice(0, limit),
      entries: verification.entries,
      verifiedAt,
    };
  }
}

/** Thrown when the audit store / verify seam is unavailable (maps to 503). */
export class AuditUnavailableError extends Error {}

/** Thin free function form used by the route + MCP engine. */
export function queryXdr(projection: AuditXdrProjection, query: XdrQuery): Promise<XdrResult> {
  return projection.verifyAndProject(query);
}
