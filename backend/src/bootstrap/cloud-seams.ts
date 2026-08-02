/**
 * Cloud composition-root seams — the small, PURE pieces of the bootstrap →
 * cloud wiring, extracted so they are unit-testable without a full boot
 * (mirrors {@link ./billing-seams.ts} / {@link ./observability-seams.ts} /
 * {@link ./conductor-seams.ts}):
 *
 *   - {@link createCloudRunEventBridge} — the {@link CloudRunEventSink} that
 *     bridges the sandbox provisioner's LOCAL lifecycle events onto the agent-os
 *     RunEvent bus (`source:'engine'`), so cloud-substrate runs stream onto the
 *     SAME shared board every conductor/engine run does. The two shapes are
 *     deliberately different (the cloud domain never imports `@recoder/agent-os`),
 *     so this adapter joins them at the composition root. Degrade-truthful: a
 *     bus rejection is warn-logged (never re-thrown into the provision path, and
 *     never masked as a delivered event).
 *   - {@link createCloudBillingQuotaBridge} — the {@link TenantBillingQuotaPort}
 *     over the Phase-9 billing {@link EntitlementGate}, so a tenant's plan can
 *     TIGHTEN (never widen) its cloud quota. Only `preview` has a billing usage
 *     kind counterpart; `sandbox`/`concurrent` resolve `null` (no billing kind
 *     exists — the tenant quota stands alone, truthfully, instead of borrowing an
 *     unrelated meter). A billing fault also resolves `null` — the tenant quota
 *     stands alone, never a faked lift and never a fabricated deny.
 *
 * Neither reads `process.env` nor owns cross-domain state; each degrades truthfully.
 */
import type { RunEvent } from '@recoder/agent-os';
import type { Logger } from '../shared/logger.js';
import type {
  CloudQuotaKind,
  CloudRunEvent,
  CloudRunEventSink,
  Tenant,
  TenantBillingQuotaPort,
} from '../domains/cloud/index.js';
import type { BillingSubject, EntitlementGate } from '../domains/billing/index.js';

/** The narrow agent-os RunEvent bus surface the sandbox-lifecycle bridge ingests onto. */
export interface CloudRunEventBus {
  ingest(
    event: RunEvent,
    source: 'engine'
  ): Promise<{
    readonly accepted: boolean;
    readonly rejection?: { readonly reason: string; readonly message: string };
  }>;
}

/** Deps for the sandbox-lifecycle RunEvent bridge. */
export interface CloudRunEventBridgeDeps {
  readonly bus: CloudRunEventBus;
  readonly logger: Logger;
}

/**
 * Map a cloud sandbox lifecycle event onto the frozen agent-os `RunEvent` shape.
 * Always a `log` (append-only evidence) — a sandbox transition is NEVER a run
 * state transition, so the bridge can never move a TaskRun's state machine. A
 * conductor-linked provision carries its `runId` (the event lands on that run's
 * board); a standalone sandbox keys its own `taskId` off the sandbox id.
 */
export function toAgentOsRunEvent(event: CloudRunEvent): RunEvent {
  return {
    // Deterministic per lifecycle transition ⇒ bus idempotency dedupes replays.
    eventId: `event_cloud_${event.sandboxId}_${event.type}_${event.at}`,
    type: 'log',
    taskId: event.runId ? event.runId.replace(/^run_/, '') : event.sandboxId,
    ...(event.runId ? { runId: event.runId } : {}),
    message: `${event.type}: sandbox ${event.sandboxId} (${event.provider}) → ${event.status}`,
    createdAt: event.at,
    data: {
      source: 'cloud',
      cloudEventType: event.type,
      sandboxId: event.sandboxId,
      tenantId: event.tenantId,
      provider: event.provider,
      status: event.status,
      ...(event.detail ? { detail: event.detail } : {}),
    },
  };
}

/**
 * Build the cloud → agent-os RunEvent bridge. The provisioner's own `emit`
 * wrapper already catches THROWN faults; this bridge additionally surfaces a
 * returned (non-thrown) bus rejection as a truthful warn — never a masked drop.
 */
export function createCloudRunEventBridge(
  deps: CloudRunEventBridgeDeps
): CloudRunEventSink {
  const { bus, logger } = deps;
  return {
    async emit(event: CloudRunEvent): Promise<void> {
      const result = await bus.ingest(toAgentOsRunEvent(event), 'engine');
      if (!result.accepted) {
        logger.warn(
          {
            sandboxId: event.sandboxId,
            type: event.type,
            reason: result.rejection?.reason,
            message: result.rejection?.message,
          },
          'cloud run-event ingest rejected by the agent-os bus'
        );
      }
    },
  };
}

/** Resolve the billing subject a tenant's entitlements bill against (org wins). */
export function tenantBillingSubject(tenant: Tenant): BillingSubject {
  return tenant.orgId
    ? { subjectId: tenant.orgId, kind: 'org' }
    : { subjectId: tenant.ownerUserId, kind: 'user' };
}

/**
 * Build the billing → cloud quota bridge. `entitledLimit` returns the plan's
 * catalog ceiling for the mapped billing usage kind (`0` = unlimited in BOTH
 * vocabularies, so the limit passes through verbatim), or `null` when billing
 * has no counterpart kind or faults — tenancy then keeps the tenant-row quota
 * alone (billing may only ever TIGHTEN, never widen and never fabricate).
 */
export function createCloudBillingQuotaBridge(
  gate: EntitlementGate
): TenantBillingQuotaPort {
  return {
    async entitledLimit(
      tenant: Tenant,
      kind: CloudQuotaKind
    ): Promise<number | null> {
      // Billing meters `preview`; there is NO `sandbox`/`concurrent` usage kind —
      // resolving null keeps the tenant quota authoritative instead of guessing.
      if (kind !== 'preview') return null;
      try {
        const decision = await gate.checkQuota(tenantBillingSubject(tenant), 'preview');
        return decision.limit;
      } catch {
        return null; // billing fault ⇒ tenant quota stands alone (truthful degrade)
      }
    },
  };
}
