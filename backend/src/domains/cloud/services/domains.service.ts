/**
 * `DomainsService` — the custom-domain (`cloud_domains`) CRUD + DNS/TLS
 * verification service. A tenant attaches a hostname to route a preview/app
 * through; the service mints the expected DNS challenge records (a TXT
 * ownership token + an optional CNAME to the platform target), persists the
 * pending row, and later RE-CHECKS ownership through an injected
 * {@link DomainVerifierPort}.
 *
 * TRUTHFUL DEGRADE (fail-safe law §37): the verifier is an OPTIONAL seam the
 * composition root injects (a real DNS resolver / ACME probe). When it is
 * ABSENT, `verify` NEVER fabricates a `verified` — it returns a truthful
 * `SERVICE_UNAVAILABLE` and the row stays `pending`. Without a reachable
 * `cloud_domains` store every write returns `SERVICE_UNAVAILABLE` and reads
 * return empty — never an optimistic success.
 *
 * All access is tenant-scoped by the caller (the edge/MCP tool passes the
 * resolved tenant id); the repo enforces `WHERE tenant_id = :tenantId`.
 */
import { randomUUID } from 'node:crypto';
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import { ok, err, type Result } from '../../../shared/result.js';
import type { Logger } from '../../../shared/logger.js';
import type { DomainRepository } from '../ports/cloud-repository.port.js';
import type { DnsRecord, DomainRecord, DomainVerificationStatus, TlsStatus } from '../types.js';

/** The outcome of a real DNS/TLS ownership check for a hostname. */
export interface DomainVerifierResult {
  /** True only when the expected challenge record was OBSERVED in live DNS. */
  readonly verified: boolean;
  /** Truthful TLS provisioning state (never `active` unless a cert exists). */
  readonly tls: TlsStatus;
  /** Machine/human reason (e.g. `txt_record_missing`, `resolver_timeout`). */
  readonly reason?: string;
}

/**
 * The seam that performs the REAL DNS/TLS ownership check. Injected by the
 * composition root; absent ⇒ `verify` truthfully stays `pending`.
 */
export interface DomainVerifierPort {
  verify(hostname: string, expected: readonly DnsRecord[]): Promise<DomainVerifierResult>;
}

export interface DomainsServiceDeps {
  readonly repo: DomainRepository;
  readonly logger: Logger;
  /** Real DNS/TLS ownership prober (absent ⇒ `verify` stays truthfully pending). */
  readonly verifier?: DomainVerifierPort;
  /** CNAME target new domains point at (from `previewBaseDomain`); null ⇒ TXT-only. */
  readonly cnameTarget?: string | null;
  /** Injectable ownership-token source (tests); default cryptographically random. */
  readonly randomToken?: () => string;
  /** Injectable id source (tests); default `dom_<uuid>`. */
  readonly idFactory?: () => string;
}

export interface DomainsService {
  /** Attach a hostname (mints DNS challenge records; row starts `pending`). */
  add(input: { tenantId: string; hostname: string }): Promise<Result<DomainRecord, AppError>>;
  /** List a tenant's custom domains (empty when the store is unreachable). */
  list(tenantId: string): Promise<readonly DomainRecord[]>;
  /** One tenant-scoped domain. */
  get(id: string, tenantId: string): Promise<Result<DomainRecord, AppError>>;
  /** Re-check ownership through the verifier; absent verifier ⇒ truthful unavailable. */
  verify(id: string, tenantId: string): Promise<Result<DomainRecord, AppError>>;
  /** Detach a domain; `NOT_FOUND` when the tenant owns no such row. */
  remove(id: string, tenantId: string): Promise<Result<{ id: string; removed: true }, AppError>>;
}

// RFC-1123-ish hostname (labels 1–63 chars, no scheme/path, must contain a dot).
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Normalize + validate a hostname; returns `null` when invalid. */
function normalizeHostname(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host.length > 253) return null;
  return HOSTNAME_RE.test(host) ? host : null;
}

export function createDomainsService(deps: DomainsServiceDeps): DomainsService {
  const { repo, logger, verifier } = deps;
  const cnameTarget = deps.cnameTarget ?? null;
  const randomToken = deps.randomToken ?? (() => randomUUID().replace(/-/g, ''));
  const idFactory = deps.idFactory ?? (() => `dom_${randomUUID().replace(/-/g, '')}`);

  /** The expected DNS records a caller must publish to prove ownership. */
  function challengeRecords(hostname: string, token: string): DnsRecord[] {
    const records: DnsRecord[] = [
      { type: 'TXT', name: `_recoder-challenge.${hostname}`, value: `recoder-verify=${token}` },
    ];
    if (cnameTarget) records.push({ type: 'CNAME', name: hostname, value: cnameTarget });
    return records;
  }

  async function add(input: { tenantId: string; hostname: string }): Promise<Result<DomainRecord, AppError>> {
    if (!repo.isAvailable()) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Domain store is unavailable.'));
    }
    const hostname = normalizeHostname(input.hostname);
    if (!hostname) {
      return err(createError(ErrorCode.VALIDATION_ERROR, 'Invalid hostname (expected a fully-qualified domain, no scheme/path).'));
    }
    // Cross-tenant hijack guard (recoder-4780): the insert upserts ON CONFLICT
    // (hostname), so without this a second tenant claiming an already-owned
    // hostname would OVERWRITE the owner's verification/DNS/TLS config. Reject a
    // hostname owned by a DIFFERENT tenant BEFORE the write; the same tenant may
    // re-add their own (idempotent refresh). The adapter's tenant-guarded
    // ON CONFLICT closes the TOCTOU residual against a concurrent claim.
    try {
      const claimed = await repo.getByHostname(hostname);
      if (claimed && claimed.tenantId !== input.tenantId) {
        return err(createError(ErrorCode.CONFLICT, 'That hostname is already claimed by another tenant.'));
      }
    } catch (cause) {
      logger.warn({ err: cause, hostname }, 'domain hostname pre-check failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Failed to check hostname availability.'));
    }
    try {
      const record = await repo.insert({
        id: idFactory(),
        tenantId: input.tenantId,
        hostname,
        verificationStatus: 'pending',
        dnsRecords: challengeRecords(hostname, randomToken()),
        tlsStatus: 'none',
      });
      return ok(record);
    } catch (cause) {
      // The guarded upsert throws a CONFLICT when another tenant claimed the
      // hostname between the pre-check and the insert (TOCTOU) — surface it
      // truthfully instead of masking it as a generic store failure. (recoder-4780)
      if ((cause as { code?: string })?.code === ErrorCode.CONFLICT) {
        return err(cause as AppError);
      }
      logger.warn({ err: cause, hostname }, 'domain add failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Failed to persist the custom domain.'));
    }
  }

  async function list(tenantId: string): Promise<readonly DomainRecord[]> {
    if (!repo.isAvailable()) return [];
    try {
      return await repo.listByTenant(tenantId);
    } catch (cause) {
      logger.warn({ err: cause, tenantId }, 'domain list failed');
      return [];
    }
  }

  async function get(id: string, tenantId: string): Promise<Result<DomainRecord, AppError>> {
    if (!repo.isAvailable()) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Domain store is unavailable.'));
    }
    try {
      const record = await repo.getById(id, tenantId);
      return record ? ok(record) : err(createError(ErrorCode.NOT_FOUND, 'Custom domain not found.'));
    } catch (cause) {
      logger.warn({ err: cause, id }, 'domain get failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Failed to read the custom domain.'));
    }
  }

  async function verify(id: string, tenantId: string): Promise<Result<DomainRecord, AppError>> {
    const existing = await get(id, tenantId);
    if (!existing.ok) return existing;
    if (!verifier) {
      // TRUTHFUL DEGRADE: no real DNS prober wired — never fake `verified`.
      return err(
        createError(ErrorCode.SERVICE_UNAVAILABLE, 'DNS verifier not configured — domain stays pending.', {
          details: { verificationStatus: existing.value.verificationStatus },
        }),
      );
    }
    let result: DomainVerifierResult;
    try {
      result = await verifier.verify(existing.value.hostname, existing.value.dnsRecords);
    } catch (cause) {
      logger.warn({ err: cause, id, hostname: existing.value.hostname }, 'domain verify probe failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'DNS verification probe failed.'));
    }
    const status: DomainVerificationStatus = result.verified ? 'verified' : 'failed';
    try {
      await repo.updateVerification(id, status, result.tls);
    } catch (cause) {
      logger.warn({ err: cause, id }, 'domain verify persist failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Failed to persist the verification result.'));
    }
    return get(id, tenantId);
  }

  async function remove(id: string, tenantId: string): Promise<Result<{ id: string; removed: true }, AppError>> {
    if (!repo.isAvailable()) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Domain store is unavailable.'));
    }
    try {
      const removed = await repo.delete(id, tenantId);
      return removed ? ok({ id, removed: true }) : err(createError(ErrorCode.NOT_FOUND, 'Custom domain not found.'));
    } catch (cause) {
      logger.warn({ err: cause, id }, 'domain remove failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Failed to remove the custom domain.'));
    }
  }

  return { add, list, get, verify, remove };
}
