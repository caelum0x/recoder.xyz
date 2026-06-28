/**
 * Conductor health / substrate / delivery-gate presentation helpers — pure
 * functions the Substrates, LiveEvents, and Governance panels use to derive
 * truthful badge tones, labels, and the structured awaiting_approval verdict
 * from REAL backend responses. Nothing here fabricates data:
 *
 *  - substrate/health derivations are pure mappings over a value the conductor
 *    actually returned (GET /substrates, GET /health/full);
 *  - `deliveryGateFromError` reads the structured 409 the conductor PR/merge
 *    delivery gate attaches (conductor.routes.ts DeliveryApprovalRequiredError
 *    handler) — it returns null for anything that is not that real gate verdict,
 *    so the Governance panel never shows a faked approval state.
 *
 * Source of truth:
 *  - docker-backend/src/conductor/conductor-health.ts (ConductorHealth)
 *  - docker-backend/src/conductor/substrate.ts (registered substrate ids)
 *  - docker-backend/src/conductor/conductor.routes.ts (409 delivery-gate data)
 *  - docker-backend/src/conductor/delivery-approval.ts (awaiting_approval state)
 */
import { ApiError } from './api';
import type {
  ConductorHealth,
  ConductorHealthStatus,
  DeliveryGateDetail,
  SubstrateAvailability,
  WorkspaceSubstrate,
} from '../types';

/** Stable display order for registered substrates. */
export const SUBSTRATE_ORDER: readonly WorkspaceSubstrate[] = [
  'tmux_worktree',
  'daytona',
  'in_process',
];

/** Human label for a substrate id (underscores spaced). */
export function substrateLabel(id: WorkspaceSubstrate | string): string {
  return String(id).replace(/_/g, ' ');
}

/** Badge tone for a substrate row: available = good, otherwise bad. */
export function substrateTone(s: Pick<SubstrateAvailability, 'available'>): string {
  return s.available ? 'good' : 'bad';
}

/**
 * Sort substrate rows into the canonical display order, keeping any unknown
 * (newly-registered) substrate ids after the known ones in a stable order.
 */
export function sortSubstrates(rows: readonly SubstrateAvailability[]): SubstrateAvailability[] {
  const rank = (id: string): number => {
    const i = SUBSTRATE_ORDER.indexOf(id as WorkspaceSubstrate);
    return i === -1 ? SUBSTRATE_ORDER.length : i;
  };
  return [...rows].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

/** How many of the registered substrates are actually available right now. */
export function availableSubstrateCount(rows: readonly SubstrateAvailability[]): number {
  return rows.filter((s) => s.available).length;
}

/** Badge tone for the unified health status. */
export function healthStatusTone(status: ConductorHealthStatus): string {
  switch (status) {
    case 'healthy':
      return 'good';
    case 'degraded':
      return 'warn';
    case 'unhealthy':
      return 'bad';
    default:
      return 'neutral';
  }
}

/** True when free disk has fallen below the governor's configured floor. */
export function isDiskLow(health: Pick<ConductorHealth, 'resources'>): boolean {
  return health.resources.current.freeDiskGb < health.resources.limits.minFreeDiskGb;
}

/** Count of installed/available agent runtimes the conductor can launch. */
export function availableRuntimeCount(health: Pick<ConductorHealth, 'runtimes'>): number {
  return health.runtimes.filter((r) => r.available).length;
}

/**
 * Narrow an unknown `data` payload to a real DeliveryGateDetail. Returns null
 * unless it carries the gate's canonical awaiting_approval state — so a 409 from
 * some unrelated cause is never mis-read as an approval verdict.
 */
export function asDeliveryGateDetail(data: unknown): DeliveryGateDetail | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.state !== 'awaiting_approval') return null;
  if (typeof o.action !== 'string') return null;
  return {
    state: o.state,
    action: o.action,
    approvalId: typeof o.approvalId === 'string' ? o.approvalId : undefined,
    transitioned: typeof o.transitioned === 'boolean' ? o.transitioned : undefined,
  };
}

/**
 * Extract the structured delivery-gate verdict from a thrown PR/merge error.
 * Returns null when the error is not a real 409 delivery-gate rejection (e.g. a
 * backend-unreachable, an auth failure, or a different 4xx), so the Governance
 * panel only renders a gate verdict the backend genuinely produced.
 */
export function deliveryGateFromError(err: unknown): DeliveryGateDetail | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status !== 409) return null;
  return asDeliveryGateDetail(err.data);
}

/**
 * The reason string to show alongside a gate verdict — the backend envelope's
 * `error` message (carried on the thrown ApiError), which embeds the missing
 * approval requirement / governance reason.
 */
export function deliveryGateReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
