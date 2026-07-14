/**
 * conductor-audit — wires the enterprise tenancy + audit-envelope layer
 * (packages/agent-os) into the live conductor control plane (recoder-wh74).
 *
 * Every mutating conductor route resolves a TenantContext + Principal from the
 * authenticated request and emits an AuditEnvelope. The envelope is sealed into
 * the SAME governance Merkle chain the delivery gate uses, so GET
 * /governance/audit (and the cockpit Audit Trail panel) shows a tamper-evident
 * record of EVERY mutation — create, merge, pr, archive, steer, message,
 * batch — not just deliveries.
 *
 * Fail-safe: recording is best-effort (never blocks or fails a mutation). The
 * tenant/principal resolution is pure and testable; the sealing is degrade-safe
 * via recordGovernanceAudit.
 */
import type { Request } from 'express';
import {
  resolveTenantContext,
  makeAuditEnvelope,
  LOCAL_TENANT,
  type AuditEnvelope,
  type AuditOutcome,
  type Principal,
  type TenantContext,
} from '@recoder/agent-os';
import { getRuntimeProfile } from '../runtime-profile.js';
import { recordGovernanceAudit } from './governance-gate.js';

const ORG_HEADER = 'x-recoder-org-id';
const RESIDENCY_HEADER = 'x-recoder-residency-region';

function header(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  const raw = Array.isArray(v) ? v[0] : v;
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

function callerId(req: Request): string | undefined {
  const id = (req as Request & { userId?: string }).userId;
  return typeof id === 'string' && id ? id : undefined;
}

/**
 * The tenant this request acts within. Embedded (solo desktop) → LOCAL_TENANT;
 * self_host → derived from the org header (fail-closed: a self_host request
 * with no org resolves to LOCAL only as a last resort, kept explicit here so a
 * missing org is visible in the audit rather than throwing on the hot path).
 */
export function resolveConductorTenant(req: Request): TenantContext {
  const profile = getRuntimeProfile();
  if (profile.mode === 'embedded') return LOCAL_TENANT;
  const orgId = header(req, ORG_HEADER);
  if (!orgId) return LOCAL_TENANT;
  return resolveTenantContext({
    mode: 'self_host',
    orgId,
    residencyRegion: header(req, RESIDENCY_HEADER),
  });
}

/** The authenticated actor performing the mutation. */
export function resolveConductorPrincipal(req: Request): Principal {
  const id = callerId(req);
  const tenant = resolveConductorTenant(req);
  if (!id) {
    return { principalId: 'anonymous', kind: 'user', orgId: tenant.orgId, scopes: [] };
  }
  if (id.startsWith('internal:')) {
    return { principalId: id, kind: 'service', orgId: tenant.orgId, scopes: [] };
  }
  return { principalId: id, kind: 'user', orgId: tenant.orgId, scopes: [] };
}

export interface ConductorAuditInput {
  action: string;
  targetId: string;
  outcome: AuditOutcome;
  now: string;
  metadata?: Record<string, unknown>;
}

/** Pure: build the AuditEnvelope for a conductor mutation. */
export function buildConductorAudit(req: Request, input: ConductorAuditInput): AuditEnvelope {
  return makeAuditEnvelope({
    tenant: resolveConductorTenant(req),
    principal: resolveConductorPrincipal(req),
    action: input.action,
    targetId: input.targetId,
    outcome: input.outcome,
    now: input.now,
    metadata: input.metadata,
  });
}

const OUTCOME_TO_GOV: Record<AuditOutcome, 'allow' | 'deny' | 'failure'> = {
  allowed: 'allow',
  denied: 'deny',
  error: 'failure',
};

/**
 * Build + seal a conductor mutation audit envelope into the governance Merkle
 * chain. Best-effort and non-blocking: any failure is swallowed so auditing
 * can never break a mutation. Returns the envelope (for tests/callers).
 */
export async function auditConductorMutation(
  req: Request,
  input: Omit<ConductorAuditInput, 'now'> & { runId?: string },
): Promise<AuditEnvelope> {
  const now = new Date().toISOString();
  const envelope = buildConductorAudit(req, { ...input, now });
  void recordGovernanceAudit({
    timestamp: now,
    actor: envelope.principalId,
    action: 'decision.made',
    detail: `${envelope.action} ${envelope.targetId} by ${envelope.principalKind}:${envelope.principalId} (tenant ${envelope.tenantId}) → ${envelope.outcome}`,
    outcome: OUTCOME_TO_GOV[envelope.outcome],
    runId: input.runId,
    metadata: {
      tenantId: envelope.tenantId,
      orgId: envelope.orgId,
      principalId: envelope.principalId,
      principalKind: envelope.principalKind,
      conductorAction: envelope.action,
      targetId: envelope.targetId,
      ...(envelope.metadata ?? {}),
    },
  });
  return envelope;
}
