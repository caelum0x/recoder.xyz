/**
 * useHealth — per-panel health readiness hook.
 *
 * Reads the aggregated /health/full (ConductorHealth) endpoint and maps a
 * panel's `healthKey` to a readiness boolean. This gives panels a uniform way
 * to declare "I need the dmux subsystem" or "I need the substrate" without each
 * panel making its own health fetch.
 *
 * CURRENT BACKEND SHAPE (docker-backend/src/conductor/conductor.routes.ts):
 *   GET /api/conductor/health/full → ConductorHealth with top-level keys:
 *     status, substrate, runtimes, resources, activeTails, dmux, workspaces
 *
 * STUB BEHAVIOUR: if the /health/full fetch fails, the hook returns
 * `available: true` for all panels — we degrade gracefully and let the panel's
 * own fetch surface the real error rather than hiding it behind a health gate.
 *
 * HOW TO USE:
 *   const { available, loading } = useHealth(panel.healthKey);
 *   // available is always true when healthKey is null (no backend key to check)
 */
import { usePoll } from '../lib/usePoll';
import { api } from '../lib/api';
import type { ConductorHealth } from '../types';

const HEALTH_POLL_MS = 30_000;

/**
 * Derive per-key availability from the ConductorHealth payload.
 *
 * Rules:
 *  - 'substrate': health.substrate.available
 *  - 'dmux':      health.dmux?.available
 *  - 'runtimes':  at least one runtime is available
 *  - anything else or unrecognised key: true (always available)
 */
function deriveAvailability(health: ConductorHealth, key: string): boolean {
  if (key === 'substrate') return Boolean(health.substrate?.available);
  if (key === 'dmux') return Boolean(health.dmux?.available);
  if (key === 'runtimes') return health.runtimes?.some((r) => r.available) ?? true;
  // Unknown key: optimistic — let the panel's own fetch surface errors.
  return true;
}

export interface HealthState {
  /** Whether the panel's required capability is considered available. */
  available: boolean;
  /** True while the first /health/full poll is still in flight. */
  loading: boolean;
}

/**
 * React/Preact hook — polls /health/full and maps `healthKey` to a readiness boolean.
 *
 * @param healthKey  A key into ConductorHealth, or null for always-available.
 */
export function useHealth(healthKey: string | null): HealthState {
  const health = usePoll(() => api.healthFull(), HEALTH_POLL_MS);

  // No key declared → always available (e.g. PolicyPanel, MemoryCandidatesPanel)
  if (healthKey === null) {
    return { available: true, loading: false };
  }

  // Still loading and no data yet
  if (!health.data && !health.error) {
    return { available: true, loading: true };
  }

  // Fetch errored → degrade gracefully: let the panel surface its own error
  if (health.error || !health.data) {
    return { available: true, loading: false };
  }

  return {
    available: deriveAvailability(health.data, healthKey),
    loading: false,
  };
}
