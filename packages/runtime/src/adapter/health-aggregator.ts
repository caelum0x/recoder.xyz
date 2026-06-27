import type { RuntimeHealth } from '@recoder/agent-os';
import type { DriverProbe } from '../contracts/runtime-driver';

/**
 * Merge a driver probe (+ optional env health) into the adapter's `health()` value.
 * The worst status wins; an unavailable CLI yields `offline` with a truthful message —
 * it never reports `healthy` for a missing binary.
 */
export function aggregateHealth(probe: DriverProbe, envHealth?: RuntimeHealth): RuntimeHealth {
  const checkedAt = new Date().toISOString();

  if (!probe.available) {
    return {
      status: 'offline',
      checkedAt,
      message: probe.unavailableReason ?? 'Driver is unavailable.',
      details: envHealth ? { env: envHealth } : undefined,
    };
  }

  const statuses: RuntimeHealth['status'][] = [probe.health.status];
  if (envHealth) statuses.push(envHealth.status);
  const status = worstStatus(statuses);

  return {
    status,
    checkedAt,
    message: probe.health.message,
    details: {
      version: probe.version,
      ...(probe.health.details ?? {}),
      ...(envHealth ? { env: envHealth } : {}),
    },
  };
}

const STATUS_RANK: Record<RuntimeHealth['status'], number> = {
  healthy: 0,
  degraded: 1,
  unknown: 2,
  offline: 3,
  error: 4,
};

function worstStatus(statuses: readonly RuntimeHealth['status'][]): RuntimeHealth['status'] {
  return statuses.reduce((worst, current) =>
    STATUS_RANK[current] > STATUS_RANK[worst] ? current : worst,
  );
}
