/**
 * Ziti mesh adapter — READ-ONLY status over the ziti zero-trust overlay engine
 * (`apps/desktop/server/engines/ziti`, reached over its loopback endpoint). The
 * mesh is REGISTERED AND OBSERVABLE with NO LIVE DATA PLANE: this adapter reads
 * identity registrations + engine health, it never routes traffic.
 *
 * Degrade-safe law §37 + §10.1: absent `zitiEndpoint` ⇒ engine `down` with the
 * missing source named (empty identities), never a faked `active`. A network
 * fault resolves to `unknown`/`down`, never a throw.
 */
import type { Logger } from '../../../shared/logger.js';
import type { MeshEngineStatus, ZitiIdentity } from '../ports/mesh.port.js';
import type { MeshEndpointStatus } from '../types.js';
import { globalFetch, probe, type FetchLike } from './http.js';

export interface ZitiMeshAdapterDeps {
  /** ziti Go engine loopback endpoint (`null` ⇒ engine `down`). */
  readonly endpoint: string | null;
  readonly logger: Logger;
  readonly fetchLike?: FetchLike | null;
}

/** The read-only ziti surface the mesh diagnostics service composes. */
export interface ZitiMeshAdapter {
  readonly engine: 'ziti';
  status(): Promise<MeshEngineStatus>;
  identities(): Promise<readonly ZitiIdentity[]>;
}

function coerceStatus(v: unknown): MeshEndpointStatus {
  return v === 'active' || v === 'down' ? v : 'registered';
}

export function createZitiMeshAdapter(deps: ZitiMeshAdapterDeps): ZitiMeshAdapter {
  const { endpoint, logger } = deps;
  const fetchLike = deps.fetchLike !== undefined ? deps.fetchLike : globalFetch();
  const base = endpoint ? endpoint.replace(/\/+$/, '') : null;

  async function status(): Promise<MeshEngineStatus> {
    if (!base) return { engine: 'ziti', status: 'down', reason: 'ziti endpoint not configured' };
    const r = await probe(fetchLike, `${base}/health`, { timeoutMs: 3000 });
    if (r.status === null) return { engine: 'ziti', status: 'unknown', reason: r.reason ?? 'unreachable' };
    return r.ok || r.status < 500
      ? { engine: 'ziti', status: 'up' }
      : { engine: 'ziti', status: 'degraded', reason: `health returned ${r.status}` };
  }

  async function identities(): Promise<readonly ZitiIdentity[]> {
    if (!base) return [];
    const r = await probe(fetchLike, `${base}/identities`, { timeoutMs: 3000 });
    if (!r.ok || !r.response) return [];
    try {
      const data = (await r.response.json()) as unknown;
      const list = Array.isArray(data) ? data : Array.isArray((data as { data?: unknown }).data) ? (data as { data: unknown[] }).data : [];
      return list
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          id: typeof x.id === 'string' ? x.id : '',
          name: typeof x.name === 'string' ? x.name : '',
          status: coerceStatus(x.status),
        }))
        .filter((i) => i.id !== '');
    } catch (cause) {
      logger.warn({ err: cause }, 'ziti identities parse failed');
      return [];
    }
  }

  return { engine: 'ziti', status, identities };
}
