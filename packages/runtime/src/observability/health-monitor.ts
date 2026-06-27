import type { RuntimeHealth } from '@recoder/agent-os';
import type { RuntimeDriver } from '../contracts/runtime-driver';

/**
 * Periodic CLI/env health snapshots that feed the adapter `health()` value. The monitor
 * probes registered drivers and caches the most recent truthful snapshot per driver id; it
 * never green-washes — an unavailable CLI yields an `offline`/`error` snapshot.
 */
export type HealthSnapshot = {
  driverId: string;
  health: RuntimeHealth;
  available: boolean;
  checkedAt: string;
};

export class HealthMonitor {
  readonly #snapshots = new Map<string, HealthSnapshot>();

  /** Probe a single driver and cache the snapshot. */
  async probe(driver: RuntimeDriver): Promise<HealthSnapshot> {
    const probe = await driver.probe({ surface: driver.descriptor.kind });
    const snapshot: HealthSnapshot = {
      driverId: driver.descriptor.id,
      health: probe.health,
      available: probe.available,
      checkedAt: probe.health.checkedAt,
    };
    this.#snapshots.set(driver.descriptor.id, snapshot);
    return snapshot;
  }

  /** Probe every driver once, returning the snapshot map keyed by driver id. */
  async probeAll(drivers: readonly RuntimeDriver[]): Promise<Record<string, HealthSnapshot>> {
    const out: Record<string, HealthSnapshot> = {};
    for (const driver of drivers) {
      out[driver.descriptor.id] = await this.probe(driver);
    }
    return out;
  }

  /** The last cached snapshot for a driver, if probed. */
  latest(driverId: string): HealthSnapshot | undefined {
    return this.#snapshots.get(driverId);
  }
}

export function createHealthMonitor(): HealthMonitor {
  return new HealthMonitor();
}
