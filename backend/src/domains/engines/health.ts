/**
 * Truthful engines-seam health (ARCHITECTURE §10.1). The seam reports the live
 * state of EVERY declared engine, never a faked `up`:
 *
 *  - napi engines (`openfang`/`tensorzero`/`governance`) → `up` only when their
 *    `.node` actually loaded; `down` with a reason when the addon is unbuilt.
 *  - daemon engines (`colbert`/`ops-recorder`/`multica`/`ziti`) → `up` only when
 *    the supervised loopback `/health` probe passes; `down` when the binary is
 *    unbuilt or the daemon is not started.
 *  - sidecar engines (`mem0`/`browser-use`/`pal-mcp`) → `up` only when the uv
 *    venv + entrypoint (+ required keys) are present; `down` otherwise.
 *  - cli engines (`beads`/`dmux`/`tmux`/`recodergit`) → `up` only when the binary
 *    resolves on PATH; `down` otherwise.
 *
 * Rollup: the seam SERVES as long as the MCP host was constructed, so a
 * binary-less boot is truthfully `degraded` (host up, engines down), never a
 * fabricated `up` and never a hard `down`. The seam is only `down` when the host
 * itself failed to build.
 */
import type { ComponentHealth, EngineStatus, HealthStatus } from '../../shared/health-types.js';
import type { EngineHealth } from './types.js';

export interface EnginesHealthDeps {
  /** Live, truthful readings for every declared engine. */
  readonly engines: readonly EngineHealth[];
  /** Whether the interop MCP host bundle was constructed (the seam's floor). */
  readonly hostReady: boolean;
  /** Whether the durable engine registry backing is available. */
  readonly registryDurable: boolean;
}

/** Map a domain `EngineHealth` reading into the shared `/health` engine shape. */
function toEngineStatus(reading: EngineHealth): EngineStatus {
  // The domain status union (`up|down|degraded`) is a subset of `HealthStatus`.
  const status: HealthStatus = reading.status;
  return {
    name: `${reading.engineId}:${reading.transport}`,
    status,
    ...(reading.reason ? { reason: reading.reason } : {}),
  };
}

/** Build the engines component health from the live per-engine readings. */
export function buildEnginesHealth(deps: EnginesHealthDeps): ComponentHealth {
  const engines: readonly EngineStatus[] = deps.engines.map(toEngineStatus);

  let status: HealthStatus;
  if (!deps.hostReady) {
    // The seam cannot serve its gated tool surface at all.
    status = 'down';
  } else if (engines.some((engine) => engine.status !== 'up')) {
    // Host serves, but at least one engine is unbound/impaired → truthful degrade.
    status = 'degraded';
  } else {
    status = 'up';
  }

  const upCount = engines.filter((engine) => engine.status === 'up').length;
  const base = {
    name: 'engines',
    status,
    degraded: status !== 'up',
    engines,
    detail: {
      hostReady: deps.hostReady,
      registryDurable: deps.registryDurable,
      total: engines.length,
      up: upCount,
    },
  };

  if (status === 'up') return base;
  const reason = !deps.hostReady
    ? 'interop MCP host unavailable — engine tool surface cannot serve'
    : engines
        .filter((engine) => engine.status !== 'up')
        .map((engine) => `${engine.name}: ${engine.reason ?? engine.status}`)
        .join('; ');
  return { ...base, reason };
}
