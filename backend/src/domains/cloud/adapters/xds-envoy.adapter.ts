/**
 * xDS/Envoy mesh adapter — READ-ONLY introspection over the recoder-xds control-
 * plane engine (`apps/desktop/server/engines/recoder-xds`, reached over its
 * loopback health/introspection endpoint). It reads the LIVE snapshot the
 * control plane serves over ADS — clusters/routes/listeners/endpoints + snapshot
 * version — plus engine health. It is the observe side of a registered-but-no-
 * live-data-plane mesh: it reports the CONFIG served, never routes traffic, so
 * every endpoint/cluster is `registered`, never a faked `active`.
 *
 * Degrade-safe: absent `xdsEndpoint` ⇒ engine `down` (empty config), never a
 * faked `active`; a network fault resolves to `unknown`/`down`, never a throw.
 * The introspection reads (clusters/routes/listeners/endpoints/snapshot) all
 * resolve to an EMPTY, well-formed result when the engine is absent or a probe
 * fails — the caller never sees a partial/fabricated view.
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

/** One upstream endpoint registered under a cluster (no live health — no data plane). */
export interface XdsEndpoint {
  readonly cluster: string;
  readonly address: string;
  readonly port: number;
  readonly status: MeshEndpointStatus;
}

/** A single prefix → cluster mapping inside a virtual host. */
export interface XdsRoute {
  readonly prefix: string;
  readonly cluster: string;
}

/** A domain-matched virtual host inside a route config. */
export interface XdsVirtualHost {
  readonly name: string;
  readonly domains: readonly string[];
  readonly routes: readonly XdsRoute[];
}

/** An RDS route configuration registration (its virtual hosts + prefix routes). */
export interface XdsRouteConfig {
  readonly name: string;
  readonly virtualHosts: readonly XdsVirtualHost[];
}

/** An LDS listener registration (address + its ordered HCM HTTP filter chain). */
export interface XdsListener {
  readonly name: string;
  readonly address: string;
  readonly port: number;
  readonly filterChains: number;
  readonly httpFilters: readonly string[];
  readonly routeConfig: string;
}

/** The served-snapshot version + resource tally (the snapshot status view). */
export interface XdsSnapshotInfo {
  readonly nodeId: string;
  /** Opaque monotonic snapshot version string (e.g. `v7`); empty ⇒ nothing served. */
  readonly version: string;
  readonly ready: boolean;
  readonly counts: {
    readonly clusters: number;
    readonly listeners: number;
    readonly routes: number;
    readonly endpoints: number;
  };
}

/** The read-only xDS introspection surface the mesh diagnostics service composes. */
export interface XdsEnvoyAdapter {
  readonly engine: 'xds';
  status(): Promise<MeshEngineStatus>;
  clusters(): Promise<readonly XdsCluster[]>;
  routes(): Promise<readonly XdsRouteConfig[]>;
  listeners(): Promise<readonly XdsListener[]>;
  endpoints(): Promise<readonly XdsEndpoint[]>;
  /** Served-snapshot version/status; `null` ⇒ engine absent or unreachable. */
  snapshot(): Promise<XdsSnapshotInfo | null>;
}

function coerceStatus(v: unknown): MeshEndpointStatus {
  return v === 'active' || v === 'down' ? v : 'registered';
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function str(x: unknown, fallback = ''): string {
  return typeof x === 'string' ? x : fallback;
}

function num(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : 0;
}

/** The list at `key`, or the raw value when it is already an array. */
function listAt(data: unknown, key: string): unknown[] {
  if (Array.isArray(data)) return data;
  if (isRecord(data) && Array.isArray(data[key])) return data[key] as unknown[];
  return [];
}

function mapEndpoint(x: Record<string, unknown>): XdsEndpoint {
  return {
    cluster: str(x.cluster),
    address: str(x.address),
    port: num(x.port),
    status: coerceStatus(x.status),
  };
}

export function createXdsEnvoyAdapter(deps: XdsEnvoyAdapterDeps): XdsEnvoyAdapter {
  const { endpoint, logger } = deps;
  const fetchLike = deps.fetchLike !== undefined ? deps.fetchLike : globalFetch();
  const base = endpoint ? endpoint.replace(/\/+$/, '') : null;

  /** GET a JSON introspection path; `null` when absent/unreachable/malformed. */
  async function getJson(path: string): Promise<unknown | null> {
    if (!base) return null;
    const r = await probe(fetchLike, `${base}${path}`, { timeoutMs: 3000 });
    if (!r.ok || !r.response) return null;
    try {
      return (await r.response.json()) as unknown;
    } catch (cause) {
      logger.warn({ err: cause, path }, 'xds introspection parse failed');
      return null;
    }
  }

  async function status(): Promise<MeshEngineStatus> {
    if (!base) return { engine: 'xds', status: 'down', reason: 'xds endpoint not configured' };
    const r = await probe(fetchLike, `${base}/health`, { timeoutMs: 3000 });
    if (r.status === null) return { engine: 'xds', status: 'unknown', reason: r.reason ?? 'unreachable' };
    if (r.ok) return { engine: 'xds', status: 'up' };
    return r.status >= 500
      ? { engine: 'xds', status: 'degraded', reason: `health returned ${r.status}` }
      : { engine: 'xds', status: 'degraded', reason: `unexpected ${r.status} — endpoint may not be the xds engine` };
  }

  async function clusters(): Promise<readonly XdsCluster[]> {
    const data = await getJson('/clusters');
    if (data === null) return [];
    return listAt(data, 'clusters')
      .filter(isRecord)
      .map((x) => ({
        name: str(x.name),
        type: str(x.type, 'unknown'),
        status: coerceStatus(x.status),
        endpoints: typeof x.endpoints === 'number' ? x.endpoints : Array.isArray(x.endpoints) ? x.endpoints.length : 0,
      }))
      .filter((c) => c.name !== '');
  }

  async function routes(): Promise<readonly XdsRouteConfig[]> {
    const data = await getJson('/routes');
    if (data === null) return [];
    return listAt(data, 'routes')
      .filter(isRecord)
      .map((x) => ({
        name: str(x.name),
        virtualHosts: listAt(x.virtualHosts, 'virtualHosts')
          .filter(isRecord)
          .map((vh) => ({
            name: str(vh.name),
            domains: (Array.isArray(vh.domains) ? vh.domains : []).filter((d): d is string => typeof d === 'string'),
            routes: listAt(vh.routes, 'routes')
              .filter(isRecord)
              .map((rt) => ({ prefix: str(rt.prefix), cluster: str(rt.cluster) })),
          })),
      }))
      .filter((rc) => rc.name !== '');
  }

  async function listeners(): Promise<readonly XdsListener[]> {
    const data = await getJson('/listeners');
    if (data === null) return [];
    return listAt(data, 'listeners')
      .filter(isRecord)
      .map((x) => ({
        name: str(x.name),
        address: str(x.address),
        port: num(x.port),
        filterChains: num(x.filterChains),
        httpFilters: (Array.isArray(x.httpFilters) ? x.httpFilters : []).filter((f): f is string => typeof f === 'string'),
        routeConfig: str(x.routeConfig),
      }))
      .filter((l) => l.name !== '');
  }

  async function endpoints(): Promise<readonly XdsEndpoint[]> {
    const data = await getJson('/endpoints');
    if (data === null) return [];
    return listAt(data, 'endpoints')
      .filter(isRecord)
      .map(mapEndpoint)
      .filter((e) => e.cluster !== '');
  }

  async function snapshot(): Promise<XdsSnapshotInfo | null> {
    const data = await getJson('/snapshot');
    if (!isRecord(data)) return null;
    const counts = isRecord(data.counts) ? data.counts : {};
    return {
      nodeId: str(data.nodeId),
      version: str(data.version),
      ready: data.ready === true,
      counts: {
        clusters: num(counts.clusters),
        listeners: num(counts.listeners),
        routes: num(counts.routes),
        endpoints: num(counts.endpoints),
      },
    };
  }

  return { engine: 'xds', status, clusters, routes, listeners, endpoints, snapshot };
}
