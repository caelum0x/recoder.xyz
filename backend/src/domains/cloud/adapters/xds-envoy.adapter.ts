/**
 * xDS/Envoy mesh adapter — READ-ONLY status over the recoder-xds control-plane
 * engine (`apps/desktop/server/engines/recoder-xds`, reached over its loopback
 * endpoint). Reports cluster/listener registration + engine health only; it is
 * the observe side of a registered-but-no-live-data-plane mesh.
 *
 * Degrade-safe: absent `xdsEndpoint` ⇒ engine `down` (empty clusters), never a
 * faked `active`; a network fault resolves to `unknown`/`down`, never a throw.
 */
import type { Logger } from '../../../shared/logger.js';
import type { MeshEngineStatus, XdsCluster } from '../ports/mesh.port.js';
import type { MeshEndpointStatus } from '../types.js';
import { globalFetch, probe, type FetchLike } from './http.js';

export interface XdsEnvoyAdapterDeps {
  /** recoder-xds Go engine loopback endpoint (`null` ⇒ engine `down`). */
  readonly endpoint: string | null;
  readonly logger: Logger;
  readonly fetchLike?: FetchLike | null;
}

/** The read-only xDS surface the mesh diagnostics service composes. */
export interface XdsEnvoyAdapter {
  readonly engine: 'xds';
  status(): Promise<MeshEngineStatus>;
  clusters(): Promise<readonly XdsCluster[]>;
}

function coerceStatus(v: unknown): MeshEndpointStatus {
  return v === 'active' || v === 'down' ? v : 'registered';
}

export function createXdsEnvoyAdapter(deps: XdsEnvoyAdapterDeps): XdsEnvoyAdapter {
  const { endpoint, logger } = deps;
  const fetchLike = deps.fetchLike !== undefined ? deps.fetchLike : globalFetch();
  const base = endpoint ? endpoint.replace(/\/+$/, '') : null;

  async function status(): Promise<MeshEngineStatus> {
    if (!base) return { engine: 'xds', status: 'down', reason: 'xds endpoint not configured' };
    const r = await probe(fetchLike, `${base}/health`, { timeoutMs: 3000 });
    if (r.status === null) return { engine: 'xds', status: 'unknown', reason: r.reason ?? 'unreachable' };
    return r.ok || r.status < 500
      ? { engine: 'xds', status: 'up' }
      : { engine: 'xds', status: 'degraded', reason: `health returned ${r.status}` };
  }

  async function clusters(): Promise<readonly XdsCluster[]> {
    if (!base) return [];
    const r = await probe(fetchLike, `${base}/clusters`, { timeoutMs: 3000 });
    if (!r.ok || !r.response) return [];
    try {
      const data = (await r.response.json()) as unknown;
      const list = Array.isArray(data) ? data : Array.isArray((data as { clusters?: unknown }).clusters) ? (data as { clusters: unknown[] }).clusters : [];
      return list
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          name: typeof x.name === 'string' ? x.name : '',
          type: typeof x.type === 'string' ? x.type : 'unknown',
          status: coerceStatus(x.status),
          endpoints: typeof x.endpoints === 'number' ? x.endpoints : Array.isArray(x.endpoints) ? x.endpoints.length : 0,
        }))
        .filter((c) => c.name !== '');
    } catch (cause) {
      logger.warn({ err: cause }, 'xds clusters parse failed');
      return [];
    }
  }

  return { engine: 'xds', status, clusters };
}
