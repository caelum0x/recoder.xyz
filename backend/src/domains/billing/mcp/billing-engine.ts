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
 * The subject is resolved from explicit args (`orgId` wins over `userId`); a
 * missing subject yields a truthful error rather than a guessed identity.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { BillingModule } from '../index.js';
import { USAGE_KINDS, type BillingSubject, type UsageKind } from '../types.js';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Resolve a billing subject from tool args (org scope wins). Throws when absent. */
function subjectFromArgs(raw: unknown): BillingSubject {
  const args = (raw ?? {}) as Record<string, unknown>;
  const orgId = str(args.orgId);
  if (orgId) return { subjectId: orgId, kind: 'org' };
  const userId = str(args.userId);
  if (userId) return { subjectId: userId, kind: 'user' };
  throw new Error('no billing subject: pass args.userId or args.orgId');
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
      handler: async (raw: unknown) => {
        const subject = subjectFromArgs(raw);
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
      handler: async (raw: unknown) => {
        const subject = subjectFromArgs(raw);
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
