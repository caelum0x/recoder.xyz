/**
 * Truthful Memory & Retrieval health (ARCHITECTURE §10.1). The module fronts
 * five derived/mirror engines (mem0, beads, colbert, vector, embedding) plus the
 * candidate store-of-record. Rules:
 *   - store-of-record (candidates) down       → module `down` (the one hard dep)
 *   - store up, all engines down/absent        → `degraded` (serves, but recall
 *     returns only the store's own items; nothing faked)
 *   - store up, ≥1 engine down but ≥1 up       → `degraded` with the reasons
 *   - store up, all engines up                 → `up`
 *
 * Every engine maps to an `EngineStatus`; a missing key/binary/URL yields `down`
 * with a reason — never a faked `up`.
 */
import {
  degraded,
  healthy,
  unhealthy,
  type ComponentHealth,
  type EngineStatus,
  type HealthStatus,
} from '../../shared/health-types.js';
import type { MemoryEngineReadiness, MemoryEngineName } from './types.js';

const NAME = 'memory';

/** Map one readiness snapshot to a health `EngineStatus`. */
function toEngineStatus(r: MemoryEngineReadiness): EngineStatus {
  const status: HealthStatus = r.available ? 'up' : 'down';
  return r.reason ? { name: r.name, status, reason: r.reason } : { name: r.name, status };
}

/**
 * Roll up the memory engines into one truthful component report. `candidates`
 * (the store-of-record) is the single hard dependency; every other engine is a
 * degrade-safe mirror whose absence downgrades to `degraded`, never `down`.
 */
export function memoryHealth(engines: readonly MemoryEngineReadiness[]): ComponentHealth {
  const byName = new Map<MemoryEngineName, MemoryEngineReadiness>();
  for (const e of engines) byName.set(e.name, e);

  const store = byName.get('candidates');
  const engineStatuses: EngineStatus[] = engines.map(toEngineStatus);

  // Store-of-record is the one hard dependency: its absence is a real `down`.
  if (!store || !store.available) {
    return unhealthy(
      NAME,
      store?.reason ?? 'memory store-of-record (candidates) unavailable',
      engineStatuses,
    );
  }

  const mirrors = engines.filter((e) => e.name !== 'candidates');
  const downMirrors = mirrors.filter((e) => !e.available);

  if (downMirrors.length === mirrors.length && mirrors.length > 0) {
    return degraded(
      NAME,
      'all derived memory engines down — recall returns store items only',
      engineStatuses,
    );
  }

  if (downMirrors.length > 0) {
    const names = downMirrors.map((e) => e.name).join(', ');
    return degraded(NAME, `derived engine(s) impaired: ${names}`, engineStatuses);
  }

  return { ...healthy(NAME), engines: engineStatuses };
}
