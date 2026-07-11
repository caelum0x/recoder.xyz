import type { Principal, TenantContext } from './tenant-context';

export type AuditOutcome = 'allowed' | 'denied' | 'error';

/**
 * AuditEnvelope — the tamper-evident record of one control-plane mutation.
 * P0 defines the shape + a deterministic constructor; the hash-chain fields
 * (prevHash/seq/signature) are populated by the ledger in Phase 3.
 */
export type AuditEnvelope = {
  tenantId: string;
  orgId: string;
  principalId: string;
  principalKind: Principal['kind'];
  action: string;
  targetId: string;
  outcome: AuditOutcome;
  recordedAt: string;
  /** Hash of the operation payload (never raw secret values). Filled in Phase 3. */
  payloadHash?: string;
  metadata?: Record<string, unknown>;
};

export type MakeAuditEnvelopeInput = {
  tenant: TenantContext;
  principal: Principal;
  action: string;
  targetId: string;
  outcome: AuditOutcome;
  /** Caller-supplied timestamp — keeps the core pure/deterministic. */
  now: string;
  payloadHash?: string;
  metadata?: Record<string, unknown>;
};

export function makeAuditEnvelope(input: MakeAuditEnvelopeInput): AuditEnvelope {
  return {
    tenantId: input.tenant.tenantId,
    orgId: input.tenant.orgId,
    principalId: input.principal.principalId,
    principalKind: input.principal.kind,
    action: input.action,
    targetId: input.targetId,
    outcome: input.outcome,
    recordedAt: input.now,
    payloadHash: input.payloadHash,
    metadata: input.metadata,
  };
}

export type Audited<T> = { next: T; audit: AuditEnvelope };

/** Pair a computed next-state with its audit envelope. */
export function withAudit<T>(next: T, audit: AuditEnvelope): Audited<T> {
  return { next, audit };
}
