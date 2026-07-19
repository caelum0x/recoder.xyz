/**
 * Ziti mesh adapter — the introspection surface over the OpenZiti zero-trust
 * overlay engine (`apps/desktop/server/engines/ziti`, reached over its controller
 * loopback endpoint — the edge-management REST API the vendored controller
 * serves). The mesh is REGISTERED AND OBSERVABLE with NO LIVE DATA PLANE: this
 * adapter reads identity + service registrations, enrollment posture, and engine
 * health; it never routes traffic.
 *
 * READ-MOSTLY: `status`/`identities`/`services`/`enrollments`/`topology` are
 * read-only. The single WRITE — {@link ZitiMeshAdapter.enroll} (create + enrol an
 * identity/edge-router) — is TRANSPORT ONLY here; the caller (the cloud mesh MCP
 * write tool) runs the `GovernanceGate` `decide → audit` BEFORE/AFTER invoking it.
 *
 * Degrade-safe law §37 + §10.1: absent `zitiEndpoint` (controller/CLI not
 * configured) ⇒ engine `down` with the missing source named (empty lists; enroll
 * returns `{ ok:false, reason }`), never a faked `active`/success. A network fault
 * resolves to `unknown`/`down`/`{ ok:false }`, never a throw.
 *
 * LIVE PATH: the loopback facade maps 1:1 to the OpenZiti edge-management REST
 * resources — `GET /identities`, `GET /services`, `POST /identities` (enrol). The
 * `fetchLike` seam is injected so tests mock the controller without a live daemon.
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  MeshEngineStatus,
  MeshTopology,
  ZitiEnrollOutcome,
  ZitiEnrollSpec,
  ZitiEnrollment,
  ZitiIdentity,
  ZitiService,
} from '../ports/mesh.port.js';
import type { MeshEndpointStatus } from '../types.js';
import { globalFetch, probe, type FetchLike } from './http.js';

export interface ZitiMeshAdapterDeps {
  /** ziti controller loopback endpoint (`null` ⇒ engine `down`). */
  readonly endpoint: string | null;
  readonly logger: Logger;
  readonly fetchLike?: FetchLike | null;
  readonly now?: () => Date;
}

/** The introspection + governed-write ziti surface the mesh service composes. */
export interface ZitiMeshAdapter {
  readonly engine: 'ziti';
  status(): Promise<MeshEngineStatus>;
  identities(): Promise<readonly ZitiIdentity[]>;
  /** Registered ziti services (name/status/encryption/role attributes). */
  services(): Promise<readonly ZitiService[]>;
  /** Enrollment posture per identity/endpoint (enrolled vs outstanding token). */
  enrollments(): Promise<readonly ZitiEnrollment[]>;
  /** The merged read-only topology/health snapshot (engine + registrations). */
  topology(): Promise<MeshTopology>;
  /**
   * WRITE (transport only — the MCP tool gates it): create + enrol an identity or
   * edge-router. Degrade-safe: absent controller ⇒ `{ ok:false, reason }`.
   */
  enroll(spec: ZitiEnrollSpec): Promise<ZitiEnrollOutcome>;
}

/** The write seam the governance-gated mesh MCP tool drives (transport only). */
export type ZitiMeshEnroller = Pick<ZitiMeshAdapter, 'enroll'>;

function coerceStatus(v: unknown): MeshEndpointStatus {
  return v === 'active' || v === 'down' ? v : 'registered';
}

/** Narrow an unknown JSON body to a list (bare array or `{ data: [...] }`). */
function toList(data: unknown, key = 'data'): readonly Record<string, unknown>[] {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>)?.[key])
      ? ((data as Record<string, unknown>)[key] as unknown[])
      : [];
  return arr.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
}

function str(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function strArray(x: unknown): readonly string[] {
  return Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];
}

/** Map one identity record's `enrollment` sub-object to a truthful posture. */
function toEnrollment(x: Record<string, unknown>): ZitiEnrollment {
  const enrollment = (x.enrollment ?? {}) as Record<string, unknown>;
  // OpenZiti nests the outstanding token under the method key (ott/ottca/updb);
  // an empty enrollment object means the identity has already joined.
  const methodKeys = Object.keys(enrollment).filter((k) => k !== '');
  const explicitEnrolled = typeof x.enrolled === 'boolean' ? x.enrolled : undefined;
  const enrolled = explicitEnrolled ?? methodKeys.length === 0;
  const method = str(x.enrollmentMethod) || methodKeys[0] || (enrolled ? 'none' : 'unknown');
  const expiresRaw =
    str((enrollment[method] as Record<string, unknown> | undefined)?.expiresAt) || str(enrollment.expiresAt) || str(x.enrollmentExpiresAt);
  return {
    identityId: str(x.id),
    identityName: str(x.name),
    method,
    enrolled,
    expiresAt: !enrolled && expiresRaw ? expiresRaw : null,
  };
}

export function createZitiMeshAdapter(deps: ZitiMeshAdapterDeps): ZitiMeshAdapter {
  const { endpoint, logger } = deps;
  const fetchLike = deps.fetchLike !== undefined ? deps.fetchLike : globalFetch();
  const now = deps.now ?? (() => new Date());
  const base = endpoint ? endpoint.replace(/\/+$/, '') : null;

  async function status(): Promise<MeshEngineStatus> {
    if (!base) return { engine: 'ziti', status: 'down', reason: 'ziti endpoint not configured' };
    const r = await probe(fetchLike, `${base}/health`, { timeoutMs: 3000 });
    if (r.status === null) return { engine: 'ziti', status: 'unknown', reason: r.reason ?? 'unreachable' };
    if (r.ok) return { engine: 'ziti', status: 'up' };
    return r.status >= 500
      ? { engine: 'ziti', status: 'degraded', reason: `health returned ${r.status}` }
      : { engine: 'ziti', status: 'degraded', reason: `unexpected ${r.status} — endpoint may not be the ziti engine` };
  }

  /** GET a controller list resource, degrade-safe (empty on any fault). */
  async function getList(path: string, label: string): Promise<readonly Record<string, unknown>[]> {
    if (!base) return [];
    const r = await probe(fetchLike, `${base}${path}`, { timeoutMs: 3000 });
    if (!r.ok || !r.response) return [];
    try {
      return toList(await r.response.json());
    } catch (cause) {
      logger.warn({ err: cause }, `ziti ${label} parse failed`);
      return [];
    }
  }

  async function identities(): Promise<readonly ZitiIdentity[]> {
    const list = await getList('/identities', 'identities');
    return list
      .map((x) => ({ id: str(x.id), name: str(x.name), status: coerceStatus(x.status) }))
      .filter((i) => i.id !== '');
  }

  async function services(): Promise<readonly ZitiService[]> {
    const list = await getList('/services', 'services');
    return list
      .map((x) => ({
        id: str(x.id),
        name: str(x.name),
        status: coerceStatus(x.status),
        encryptionRequired: x.encryptionRequired === true,
        roleAttributes: strArray(x.roleAttributes),
      }))
      .filter((s) => s.name !== '');
  }

  async function enrollments(): Promise<readonly ZitiEnrollment[]> {
    const list = await getList('/identities', 'enrollments');
    return list.map(toEnrollment).filter((e) => e.identityId !== '');
  }

  async function topology(): Promise<MeshTopology> {
    const [engine, ids, svcs, enrs] = await Promise.all([status(), identities(), services(), enrollments()]);
    return { engine, identities: ids, services: svcs, enrollments: enrs, checkedAt: now().toISOString() };
  }

  async function enroll(spec: ZitiEnrollSpec): Promise<ZitiEnrollOutcome> {
    if (!base) return { ok: false, reason: 'ziti controller endpoint not configured' };
    const name = spec.name.trim();
    if (!name) return { ok: false, reason: 'identity name is required' };
    const body = JSON.stringify({
      name,
      type: spec.isRouter ? 'Router' : 'Device',
      enrollment: { [spec.method?.trim() || 'ott']: true },
      roleAttributes: spec.roleAttributes ?? [],
    });
    const r = await probe(fetchLike, `${base}/identities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      timeoutMs: 5000,
    });
    if (r.status === null) return { ok: false, reason: r.reason ?? 'ziti controller unreachable' };
    if (!r.ok || !r.response) return { ok: false, reason: `ziti controller returned ${r.status}` };
    try {
      const parsed = ((await r.response.json()) ?? {}) as Record<string, unknown>;
      const data = (parsed.data ?? parsed) as Record<string, unknown>;
      const id = str(data.id) || str(parsed.id);
      if (!id) return { ok: false, reason: 'ziti controller response missing identity id' };
      return {
        ok: true,
        identity: { id, name, status: coerceStatus(data.status) },
        enrollmentJwt: str(data.enrollmentJwt) || str((data.enrollment as Record<string, unknown> | undefined)?.jwt) || null,
      };
    } catch (cause) {
      logger.warn({ err: cause }, 'ziti enroll response parse failed');
      return { ok: false, reason: 'ziti controller response was not valid JSON' };
    }
  }

  return { engine: 'ziti', status, identities, services, enrollments, topology, enroll };
}
