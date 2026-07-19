/**
 * xDS control-plane WRITE adapter — the transport that drives the recoder-xds Go
 * engine's incremental `POST /network-config` write (`apps/desktop/server/engines/
 * recoder-xds`, reached over its loopback health endpoint). It registers ONE
 * preview / mesh edge as an Envoy upstream and bumps the served snapshot version,
 * so a running Envoy fronts the new edge WITHOUT a restart.
 *
 * This is DELIBERATELY separate from the READ-ONLY {@link XdsEnvoyAdapter}: that
 * adapter's frozen contract observes the served snapshot; this one mutates it. The
 * write is governed at the service that composes it (`mesh-fabric.service.ts`).
 *
 * Degrade-truthful law §37: absent `endpoint` ⇒ `isConfigured():false` +
 * `registerUpstream` returns `{ ok:false, reason }` (never a faked bump); a
 * network fault / a non-2xx (e.g. the engine's 422 for an invalid edge) resolves
 * to `{ ok:false, reason }`, never a throw. The `fetchLike` seam is injected so
 * tests drive it without a live engine.
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  XdsControlPlaneWriter,
  XdsSnapshotBumpOutcome,
  XdsUpstreamSpec,
} from '../ports/mesh-write.port.js';
import { globalFetch, probe, type FetchLike } from './http.js';

export interface XdsControlPlaneWriterDeps {
  /** recoder-xds Go engine loopback endpoint (`null` ⇒ writer not configured). */
  readonly endpoint: string | null;
  readonly logger: Logger;
  readonly fetchLike?: FetchLike | null;
}

function str(x: unknown, fallback = ''): string {
  return typeof x === 'string' ? x : fallback;
}

function num(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : 0;
}

export function createXdsControlPlaneWriter(
  deps: XdsControlPlaneWriterDeps
): XdsControlPlaneWriter {
  const { endpoint, logger } = deps;
  const fetchLike =
    deps.fetchLike !== undefined ? deps.fetchLike : globalFetch();
  const base = endpoint ? endpoint.replace(/\/+$/, '') : null;

  function isConfigured(): boolean {
    return base !== null;
  }

  async function registerUpstream(
    spec: XdsUpstreamSpec
  ): Promise<XdsSnapshotBumpOutcome> {
    if (!base)
      return {
        ok: false,
        reason: 'xds control-plane write endpoint not configured',
      };
    const name = spec.name.trim();
    if (!name)
      return { ok: false, reason: 'upstream cluster name is required' };
    if (!spec.host.trim() || spec.port <= 0)
      return { ok: false, reason: 'upstream host and port are required' };

    const body = JSON.stringify({
      name,
      host: spec.host.trim(),
      port: spec.port,
      ...(spec.hostHeader ? { hostHeader: spec.hostHeader } : {}),
      ...(spec.tlsUpstream ? { tlsUpstream: true } : {}),
    });
    const r = await probe(fetchLike, `${base}/network-config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      timeoutMs: 5000,
    });
    if (r.status === null)
      return { ok: false, reason: r.reason ?? 'xds control plane unreachable' };
    if (!r.ok || !r.response)
      return { ok: false, reason: `xds control plane returned ${r.status}` };
    try {
      const parsed = ((await r.response.json()) ?? {}) as Record<
        string,
        unknown
      >;
      const version = str(parsed.version);
      if (!version)
        return {
          ok: false,
          reason: 'xds control plane response missing snapshot version',
        };
      return {
        ok: true,
        version,
        clusters: num(parsed.clusters),
        cluster: str(parsed.cluster, name),
      };
    } catch (cause) {
      logger.warn(
        { err: cause },
        'xds control-plane write response parse failed'
      );
      return {
        ok: false,
        reason: 'xds control plane response was not valid JSON',
      };
    }
  }

  return { isConfigured, registerUpstream };
}
