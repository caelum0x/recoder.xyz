/**
 * Truthful edge health (ARCHITECTURE §10.1). The edge reports the state of its
 * request surface — never a faked `up`:
 *
 *  - `listening`  — is the HTTP server bound + accepting? Before `listen()` (or
 *    after `stop()`) the edge is truthfully `down`, not serving.
 *  - `mounts`     — every route provider's mount outcome. A `skipped-degraded`
 *    mount (provider reported `down`) or a `missing` mount (unresolved provider)
 *    degrades the edge: the surface serves, but a domain's routes are absent.
 *  - `wsBackends` — each WS registration; a `down` backend (e.g. duplicate path)
 *    degrades the edge.
 *
 * Rollup: not listening ⇒ `down`. Otherwise any non-`mounted` mount or any
 * non-`up` WS backend ⇒ `degraded`; else `up`. A booted edge with every domain
 * mounted and no WS conflicts is `up`.
 */
import type { ComponentHealth } from '../../shared/health-types.js';
import type { EdgeHealth, MountStatus, WsBackendStatus } from './types.js';

export interface EdgeHealthInput {
  readonly listening: boolean;
  readonly mounts: readonly MountStatus[];
  readonly wsBackends: readonly WsBackendStatus[];
}

/** Fold the mount + WS + listening facts into the structured {@link EdgeHealth}. */
export function buildEdgeHealth(input: EdgeHealthInput): EdgeHealth {
  const mountProblem = input.mounts.some((m) => m.state !== 'mounted');
  const wsProblem = input.wsBackends.some((w) => w.status !== 'up');
  const degraded = mountProblem || wsProblem;

  const status: EdgeHealth['status'] = !input.listening ? 'down' : degraded ? 'degraded' : 'up';

  return {
    status,
    degraded: status !== 'up',
    listening: input.listening,
    mounts: input.mounts,
    wsBackends: input.wsBackends,
  };
}

/** One-line reason summarising every non-serving mount / WS backend. */
function summariseProblems(edge: EdgeHealth): string {
  const parts: string[] = [];
  if (!edge.listening) parts.push('server not listening');
  for (const m of edge.mounts) {
    if (m.state !== 'mounted') parts.push(`mount ${m.providerKey || m.base}: ${m.state}${m.reason ? ` (${m.reason})` : ''}`);
  }
  for (const w of edge.wsBackends) {
    if (w.status !== 'up') parts.push(`ws ${w.path}: ${w.status}${w.reason ? ` (${w.reason})` : ''}`);
  }
  return parts.join('; ');
}

/** Project {@link EdgeHealth} onto the shared {@link ComponentHealth} for the aggregate. */
export function toComponentHealth(edge: EdgeHealth, name = 'edge'): ComponentHealth {
  const detail = {
    listening: edge.listening,
    mounts: edge.mounts.length,
    mounted: edge.mounts.filter((m) => m.state === 'mounted').length,
    wsBackends: edge.wsBackends.length,
  };

  if (edge.status === 'up') {
    return { name, status: 'up', degraded: false, detail };
  }
  return {
    name,
    status: edge.status,
    degraded: edge.degraded,
    reason: summariseProblems(edge) || 'edge not fully serving',
    detail,
  };
}
