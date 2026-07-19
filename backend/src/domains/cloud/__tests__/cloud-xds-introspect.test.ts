/**
 * xDS introspection — adapter parsing + degrade-safety + the read-only MCP tools.
 *
 * The recoder-xds control plane exposes a READ-ONLY JSON introspection surface
 * (/health, /snapshot, /clusters, /routes, /listeners, /endpoints) over its
 * loopback endpoint. This proves:
 *  - the adapter parses each surface into the typed introspection view;
 *  - absent endpoint / unreachable engine ⇒ EMPTY, well-formed results + a `down`
 *    status with the missing source named — never a faked `active`/live view;
 *  - the mesh has NO LIVE DATA PLANE, so every endpoint/cluster is `registered`;
 *  - the cloud xDS MCP tools surface exactly that, degrade-safe.
 *
 * The CLI/network seam is MOCKED via an injected `FetchLike`. The LIVE path is a
 * real HTTP GET against the Go engine's health/introspection port (default
 * `:18001`, gRPC ADS on `:18000`) — see xds-envoy.adapter.ts.
 */
import { describe, it, expect } from 'vitest';
import { createXdsEnvoyAdapter, type XdsEnvoyAdapter } from '../adapters/xds-envoy.adapter.js';
import { buildCloudXdsMcpTools } from '../mcp/cloud-xds-engine.js';
import type { FetchLike, HttpResponse } from '../adapters/http.js';
import type { CloudModule } from '../index.js';
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { Logger } from '../../../shared/logger.js';

const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => silentLogger,
} as unknown as Logger;

/** A fake engine that answers each introspection path from a fixture map. */
function fakeEngine(routes: Record<string, unknown>): FetchLike {
  return async (url: string): Promise<HttpResponse> => {
    const path = new URL(url).pathname;
    const has = Object.prototype.hasOwnProperty.call(routes, path);
    const body = has ? routes[path] : {};
    return {
      ok: has,
      status: has ? 200 : 404,
      text: async () => JSON.stringify(body),
      json: async () => body,
    };
  };
}

const servedFixture: Record<string, unknown> = {
  '/health': { engine: 'xds', ready: true, nodeId: 'recoder-mesh', version: 'v7' },
  '/snapshot': {
    nodeId: 'recoder-mesh',
    version: 'v7',
    ready: true,
    counts: { clusters: 2, listeners: 1, routes: 1, endpoints: 2 },
  },
  '/clusters': {
    clusters: [
      { name: 'backend', type: 'STRICT_DNS', status: 'registered', endpoints: [{ address: 'backend', port: 3100 }] },
      { name: 'recoder_ext_authz', type: 'STRICT_DNS', status: 'registered', endpoints: 1 },
    ],
  },
  '/routes': {
    routes: [
      {
        name: 'recoder-routes',
        virtualHosts: [
          { name: 'catch-all', domains: ['*'], routes: [{ prefix: '/backend/', cluster: 'backend' }] },
        ],
      },
    ],
  },
  '/listeners': {
    listeners: [
      {
        name: 'recoder-ingress',
        address: '0.0.0.0',
        port: 8443,
        filterChains: 1,
        httpFilters: ['envoy.filters.http.local_ratelimit', 'envoy.filters.http.ext_authz', 'envoy.filters.http.router'],
        routeConfig: 'recoder-routes',
      },
    ],
  },
  '/endpoints': {
    endpoints: [
      { cluster: 'backend', address: 'backend', port: 3100, status: 'registered' },
      { cluster: 'recoder_ext_authz', address: 'authz', port: 9191, status: 'registered' },
    ],
  },
};

function servedAdapter(): XdsEnvoyAdapter {
  return createXdsEnvoyAdapter({ endpoint: 'http://127.0.0.1:18001', logger: silentLogger, fetchLike: fakeEngine(servedFixture) });
}

describe('xds adapter — degrade-safe when the engine is absent', () => {
  const down = createXdsEnvoyAdapter({ endpoint: null, logger: silentLogger, fetchLike: null });

  it('reports status down and names the missing source', async () => {
    const s = await down.status();
    expect(s.status).toBe('down');
    expect(s.reason).toContain('not configured');
  });

  it('returns empty, well-formed introspection (never a faked view)', async () => {
    expect(await down.clusters()).toEqual([]);
    expect(await down.routes()).toEqual([]);
    expect(await down.listeners()).toEqual([]);
    expect(await down.endpoints()).toEqual([]);
    expect(await down.snapshot()).toBeNull();
  });
});

describe('xds adapter — unreachable engine degrades (no throw)', () => {
  it('a 404/parse-fail surface yields empty results + unknown/degraded status', async () => {
    const empty = createXdsEnvoyAdapter({ endpoint: 'http://127.0.0.1:18001', logger: silentLogger, fetchLike: fakeEngine({}) });
    expect(await empty.clusters()).toEqual([]);
    expect(await empty.snapshot()).toBeNull();
    const s = await empty.status();
    expect(['degraded', 'unknown', 'down']).toContain(s.status);
  });
});

describe('xds adapter — parses the served introspection surface', () => {
  const xds = servedAdapter();

  it('status is up when /health answers 200', async () => {
    expect((await xds.status()).status).toBe('up');
  });

  it('snapshot carries the served version + resource counts', async () => {
    const snap = await xds.snapshot();
    expect(snap).not.toBeNull();
    expect(snap!.version).toBe('v7');
    expect(snap!.ready).toBe(true);
    expect(snap!.counts).toEqual({ clusters: 2, listeners: 1, routes: 1, endpoints: 2 });
  });

  it('clusters normalize endpoint arrays to a count', async () => {
    const clusters = await xds.clusters();
    expect(clusters.map((c) => c.name).sort()).toEqual(['backend', 'recoder_ext_authz']);
    expect(clusters.find((c) => c.name === 'backend')!.endpoints).toBe(1);
    expect(clusters.every((c) => c.type === 'STRICT_DNS')).toBe(true);
  });

  it('routes map prefixes to clusters under a virtual host', async () => {
    const routes = await xds.routes();
    expect(routes[0].name).toBe('recoder-routes');
    expect(routes[0].virtualHosts[0].routes[0]).toEqual({ prefix: '/backend/', cluster: 'backend' });
  });

  it('listeners preserve the hostile-by-default HTTP filter order (authz before router)', async () => {
    const [l] = await xds.listeners();
    const authz = l.httpFilters.indexOf('envoy.filters.http.ext_authz');
    const router = l.httpFilters.indexOf('envoy.filters.http.router');
    expect(authz).toBeGreaterThanOrEqual(0);
    expect(authz).toBeLessThan(router);
    expect(l.routeConfig).toBe('recoder-routes');
  });

  it('endpoints report registered status (served config, no live data plane)', async () => {
    const endpoints = await xds.endpoints();
    expect(endpoints).toHaveLength(2);
    expect(endpoints.every((e) => e.status === 'registered')).toBe(true);
    expect(endpoints.map((e) => e.port).sort()).toEqual([3100, 9191]);
  });
});

function toolMap(tools: readonly McpToolRegistration[]): Map<string, McpToolRegistration> {
  return new Map(tools.map((t) => [t.name, t]));
}

function moduleFor(xds: XdsEnvoyAdapter): CloudModule {
  return { mesh: () => ({ xds: () => xds }) } as unknown as CloudModule;
}

describe('cloud xDS MCP tools — read-only introspection surface', () => {
  it('registers exactly the five read-only introspection tools', () => {
    const names = buildCloudXdsMcpTools(moduleFor(servedAdapter())).map((t) => t.name).sort();
    expect(names).toEqual(['cloud_xds_clusters', 'cloud_xds_endpoints', 'cloud_xds_listeners', 'cloud_xds_routes', 'cloud_xds_snapshot']);
  });

  it('cloud_xds_snapshot merges status + served version', async () => {
    const tools = toolMap(buildCloudXdsMcpTools(moduleFor(servedAdapter())));
    const res = (await tools.get('cloud_xds_snapshot')!.handler({})) as Record<string, unknown>;
    expect(res.status).toBe('up');
    expect(res.version).toBe('v7');
    expect(res.counts).toEqual({ clusters: 2, listeners: 1, routes: 1, endpoints: 2 });
  });

  it('cloud_xds_clusters / routes / listeners / endpoints return counts + rows', async () => {
    const tools = toolMap(buildCloudXdsMcpTools(moduleFor(servedAdapter())));
    expect(((await tools.get('cloud_xds_clusters')!.handler({})) as { count: number }).count).toBe(2);
    expect(((await tools.get('cloud_xds_routes')!.handler({})) as { count: number }).count).toBe(1);
    expect(((await tools.get('cloud_xds_listeners')!.handler({})) as { count: number }).count).toBe(1);
    expect(((await tools.get('cloud_xds_endpoints')!.handler({})) as { count: number }).count).toBe(2);
  });

  it('degrades truthfully when the engine is absent (empty rows, no throw)', async () => {
    const down = createXdsEnvoyAdapter({ endpoint: null, logger: silentLogger, fetchLike: null });
    const tools = toolMap(buildCloudXdsMcpTools(moduleFor(down)));
    const snap = (await tools.get('cloud_xds_snapshot')!.handler({})) as Record<string, unknown>;
    expect(snap.status).toBe('down');
    expect(snap.version).toBeNull();
    expect(((await tools.get('cloud_xds_clusters')!.handler({})) as { count: number }).count).toBe(0);
    expect(((await tools.get('cloud_xds_endpoints')!.handler({})) as { count: number }).count).toBe(0);
  });
});
