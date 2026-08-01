/**
 * `AuditChainService` — the tamper-evident SHA-256 Merkle writer + verifier that
 * bridges the kernel's decision into the DURABLE chain (`governance_audit` via
 * `AuditRepository`). The `@recoder/governance` package's own audit store is
 * in-memory; this service persists a hash-chained, immutable record so a restart
 * or an external verifier can prove every decision was recorded.
 *
 * Seal: `entry_hash = SHA-256(prev_hash || '|' || canonical(entryFields))` where
 * `canonical` is a stable, key-sorted JSON encoding — deterministic so `append`
 * and `verify` derive identical hashes. `verify()` re-walks the durable chain and
 * (when a kernel is provided) cross-checks the kernel's own tip against the DB
 * tip, surfacing divergence rather than hiding it.
 */
import { createHash } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import type { GovernanceKernelPort } from '../ports/kernel.port.js';
import type { AuditRepository, AuditRangeQuery, AuditSealer } from '../ports/audit-repo.port.js';
import type { AuditEntryInput, AuditRecord, AuditVerification } from '../types.js';
import type { AuditTipSigner, TipSignature } from '../adapters/audit-signer.adapter.js';

export type { TipSignature } from '../adapters/audit-signer.adapter.js';

export class AuditChainService {
  /** The deterministic sealer shared by append + verify (same bytes both ways). */
  private readonly seal: AuditSealer = (prevHash, entry) =>
    createHash('sha256').update(`${prevHash}|${canonicalJson(entryDigest(entry))}`).digest('hex');

  constructor(
    private readonly repo: AuditRepository,
    private readonly kernel?: GovernanceKernelPort,
    private readonly log?: Logger,
    /**
     * OPTIONAL server-held signer over the CURRENT tip hash. ADDITIVE + SEPARATE
     * from the Merkle link — it does not change `entryDigest` or the chain format.
     * Absent/unavailable ⇒ `signTip()` returns `null` (UNSIGNED, degrade-truthful).
     */
    private readonly signer?: AuditTipSigner,
  ) {}

  /** Seal an entry into the durable Merkle chain and return the persisted record. */
  async append(entry: AuditEntryInput): Promise<AuditRecord> {
    return this.repo.append(entry, this.seal);
  }

  /** The current durable chain tip, or `null` when empty. */
  async tip(): Promise<AuditRecord | null> {
    return this.repo.tip();
  }

  /**
   * A read-only page of the durable chain (ascending `seq`), scoped by the given
   * filters — e.g. `{ workspaceId }` for the per-workspace audit trail. Never
   * mutates the chain; the append-only invariant is untouched.
   */
  async range(query?: AuditRangeQuery): Promise<readonly AuditRecord[]> {
    return this.repo.range(query);
  }

  /**
   * Re-walk the durable chain (tamper detection) and, when a kernel is wired,
   * cross-check the kernel's own tip against the DB tip. A DB-chain break is
   * `ok: false` with the break `seq`; a kernel/DB tip divergence is surfaced via
   * `kernelTipMatches` (does not by itself fail the DB-chain verdict).
   */
  async verify(): Promise<AuditVerification> {
    const dbResult = await this.repo.verifyChain(this.seal);
    if (!this.kernel) return dbResult;
    try {
      const kernelTip = await this.kernel.auditTip();
      const kernelTipMatches = kernelTip === (dbResult.tipHash ?? '');
      if (!kernelTipMatches) {
        this.log?.warn(
          { kernelTip, dbTip: dbResult.tipHash },
          'governance audit: kernel tip diverges from durable DB tip (separate chains; investigate)',
        );
      }
      return { ...dbResult, kernelTipMatches };
    } catch (err) {
      this.log?.warn({ err }, 'governance audit: kernel tip probe failed');
      return dbResult;
    }
  }

  /** True when a server signing key is configured (else the tip is UNSIGNED). */
  get signingEnabled(): boolean {
    return this.signer?.available === true;
  }

  /** The server's public key (base64 raw ed25519) for external verifiers, or `null`. */
  get signerPublicKey(): string | null {
    return this.signer?.publicKey ?? null;
  }

  /**
   * Produce a DETACHED, server-held signature over the CURRENT durable tip's
   * content hash (`AuditRecord.entryHash`). This is a SEPARATE additive artifact:
   * it does NOT re-seal the chain, touch `entryDigest`, or migrate anything. Where
   * {@link verify} proves the chain is internally consistent, this proves the tip
   * was produced by THIS server.
   *
   * Degrade-truthful: returns `null` when the chain is empty (nothing to sign) OR
   * when no signing key is configured (UNSIGNED) — NEVER a forged signature.
   */
  async signTip(): Promise<TipSignature | null> {
    if (!this.signer?.available) return null;
    const tip = await this.repo.tip();
    if (!tip) return null;
    return this.signer.signHash(tip.entryHash, tip.seq);
  }

  /**
   * Verify a detached tip signature against the CURRENT durable tip, proving the
   * tip was produced by THIS server (not just internally consistent). Accepts
   * either a raw base64 signature string or a {@link TipSignature} artifact; when
   * an artifact is given its `contentHash` must equal the current tip hash (binds
   * the signature to the present tip). `publicKey` (base64 raw ed25519 or PEM)
   * defaults to the artifact's key, then the server's own key.
   *
   * Pure/degrade-safe: returns `false` on an empty chain, a tip-hash mismatch, a
   * malformed key/signature, or a failed cryptographic check — never throws.
   */
  async verifyTip(signature: TipSignature | string, publicKey?: string | null): Promise<boolean> {
    if (!this.signer) return false;
    const tip = await this.repo.tip();
    if (!tip) return false;

    const sigString = typeof signature === 'string' ? signature : signature.signature;
    // An artifact pins a specific tip hash — reject if it doesn't match the current tip.
    if (typeof signature !== 'string' && signature.contentHash !== tip.entryHash) return false;

    const key =
      publicKey ?? (typeof signature === 'string' ? undefined : signature.publicKey) ?? undefined;
    return this.signer.verifyHash(tip.entryHash, sigString, key);
  }
}

// --- canonical serialization -------------------------------------------------

/** The exact field subset that is hashed (must match repo re-hash on verify). */
function entryDigest(entry: AuditEntryInput): Record<string, unknown> {
  return {
    actorId: entry.actorId,
    action: entry.action,
    resource: entry.resource,
    effect: entry.effect,
    riskTier: entry.riskTier,
    degraded: entry.degraded,
    payload: entry.payload ?? {},
  };
}

/** Stable, key-sorted JSON so the hash is deterministic across processes. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
