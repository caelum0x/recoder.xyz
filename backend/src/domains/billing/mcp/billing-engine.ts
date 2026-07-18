/**
 * Billing MCP tools — the READ-ONLY introspection surface an agent uses to read
 * the authoritative plan + quota headroom for a subject over the composed
 * {@link EntitlementGate}. Registered as the `billing` server into the
 * interop-gated MCP host by the engines domain; every call already passed the
 * `authorize→risk→policy→audit` chain at the host boundary, so these handlers
 * stay thin and truthful (never inflate a plan or fake headroom).
 *
 *  - `billing_plan_read`      — the subject's effective plan + features + quotas.
 *  - `billing_usage_read`     — headroom for one metered kind (fail-safe: deny/zero).
 *  - `billing_provider_status`— the active MoR provider's truthful readiness.
 *
 * TENANT IDENTITY (SECURITY): the billing subject is a tenant-owned target, so it
 * is derived from the host-authorized {@link McpToolCaller} — NEVER from free-form
 * `args` alone. `args.userId` is edge-bound to the authenticated principal, but
 * `args.orgId` is NOT (`bindTenantIdentity` only covers `userId`); trusting a
 * caller-supplied `orgId` would disclose another org's plan/quota (cross-tenant).
 * So a NON-privileged caller may only read its OWN subject: an args-named subject
 * must match the caller's `userId`/`orgId`, else it is rejected; with no args the
 * caller's own subject (org scope wins) is used. Only an `admin`/`internal` caller
 * may name an arbitrary subject (a service acting on behalf of a tenant). Absent a
 * caller, the handler refuses rather than guessing an identity.
 */
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { BillingModule } from '../index.js';
import { USAGE_KINDS, type BillingSubject, type UsageKind } from '../types.js';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Does the caller carry an elevated scope that may name an arbitrary subject? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/** The caller's OWN billing subject (org scope wins over user), mirroring the HTTP edge. */
function callerOwnSubject(caller: McpToolCaller, userId: string): BillingSubject {
  const orgId = str(caller.orgId);
  return orgId ? { subjectId: orgId, kind: 'org' } : { subjectId: userId, kind: 'user' };
}

/** Read the explicitly requested subject from tool args (org scope wins), if any. */
function requestedSubject(raw: unknown): BillingSubject | undefined {
  const args = (raw ?? {}) as Record<string, unknown>;
  const orgId = str(args.orgId);
  if (orgId) return { subjectId: orgId, kind: 'org' };
  const userId = str(args.userId);
  if (userId) return { subjectId: userId, kind: 'user' };
  return undefined;
}

/**
 * Resolve the billing subject the handler acts for, bound to the authorized
 * {@link McpToolCaller}. A NON-privileged caller may only target its own subject;
 * a cross-tenant request (an args `orgId`/`userId` the caller does not own) is
 * rejected (403) rather than served. Absent a caller, refuse (never guess).
 */
function resolveSubject(raw: unknown, caller: McpToolCaller | undefined): BillingSubject {
  const authUserId = str(caller?.userId);
  if (!caller || !authUserId) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'billing: no authorized caller identity');
  }
  const requested = requestedSubject(raw);
  if (!requested) return callerOwnSubject(caller, authUserId);
  if (isPrivileged(caller)) return requested;
  // Own-subject only: the requested subject must match the caller's identity.
  const owns =
    requested.kind === 'org'
      ? str(caller.orgId) === requested.subjectId
      : requested.subjectId === authUserId;
  if (!owns) {
    throw createError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'billing: caller may only read its own subject',
    );
  }
  return requested;
}

function normalizeKind(v: unknown): UsageKind {
  const raw = str(v);
  if (!raw) return 'agent_run';
  if ((USAGE_KINDS as readonly string[]).includes(raw)) return raw as UsageKind;
  throw new Error(`unknown usage kind: ${raw} (expected one of ${USAGE_KINDS.join(', ')})`);
}

export function buildBillingMcpTools(module: BillingModule): readonly McpToolRegistration[] {
  return [
    {
      name: 'billing_plan_read',
      description: "Read a subject's effective plan + features + per-kind quota headroom (read-only).",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const subject = resolveSubject(raw, caller);
        const view = await module.gate().view(subject);
        return {
          subjectId: subject.subjectId,
          kind: subject.kind,
          plan: view.plan,
          features: view.features,
          quotas: view.quotas.map((q) => ({
            kind: q.kind,
            allowed: q.allowed,
            limit: q.limit,
            remaining: q.remaining,
            unlimited: q.limit === 0,
            byokBypass: q.byokBypass,
            resetAt: q.resetAt,
          })),
        };
      },
    },
    {
      name: 'billing_usage_read',
      description: "Read a subject's quota headroom for one metered kind (fail-safe: deny/zero on miss).",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const subject = resolveSubject(raw, caller);
        const kind = normalizeKind((raw as { kind?: unknown })?.kind);
        const d = await module.gate().checkQuota(subject, kind);
        return {
          subjectId: subject.subjectId,
          kind,
          allowed: d.allowed,
          plan: d.plan,
          limit: d.limit,
          remaining: d.remaining,
          unlimited: d.limit === 0,
          byokBypass: d.byokBypass,
          resetAt: d.resetAt,
          reason: d.reason ?? null,
        };
      },
    },
    {
      name: 'billing_provider_status',
      description: 'Truthful readiness of the active Merchant-of-Record billing provider.',
      handler: async () => {
        const health = await module.provider().health();
        return {
          provider: health.name,
          configured: health.configured,
          status: health.status,
          reason: health.reason ?? null,
        };
      },
    },
  ];
}
