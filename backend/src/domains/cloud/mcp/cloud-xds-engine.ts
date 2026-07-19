/**
 * Cloud xDS MCP tools — the READ-ONLY introspection surface an agent uses to
 * read what the recoder-xds Envoy control plane
 * (`apps/desktop/server/engines/recoder-xds`) is actually serving over ADS:
 * cluster / route / listener config, the served-snapshot version + status, and
 * registered endpoints. Registered as part of the `cloud` MCP server alongside
 * {@link buildCloudMcpTools}.
 *
 * These are MESH-WIDE INFRA reads, not tenant-scoped data — like the sibling
 * `cloud_mesh_status` / `cloud_fleet_status` tools they take no per-tenant
 * subject binding (the host already ran authorize→risk→policy→audit at the
 * boundary). They are strictly READ-ONLY: the control plane's config is pushed
 * by the backend network layer, never mutated through an agent tool.
 *
 * Truthful degrade (mesh has NO LIVE DATA PLANE pre-launch): when the xDS engine
 * (`:18000` gRPC / its loopback introspection endpoint) is absent or unreachable
 * every tool returns an EMPTY, well-formed result with the engine `status` named
 * — never a faked `active` cluster, a phantom route, or a live endpoint health.
 * Each endpoint/cluster is reported `registered`, reflecting served config only.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { CloudModule } from '../index.js';

export function buildCloudXdsMcpTools(module: CloudModule): readonly McpToolRegistration[] {
  const xds = () => module.mesh().xds();

  return [
    {
      name: 'cloud_xds_snapshot',
      description:
        'Read the recoder-xds control plane snapshot version + engine status + resource counts (read-only; no data plane).',
      handler: async () => {
        const [status, snapshot] = await Promise.all([xds().status(), xds().snapshot()]);
        return {
          engine: 'xds',
          status: status.status,
          ...(status.reason ? { reason: status.reason } : {}),
          nodeId: snapshot?.nodeId ?? null,
          version: snapshot?.version ?? null,
          ready: snapshot?.ready ?? false,
          counts: snapshot?.counts ?? { clusters: 0, listeners: 0, routes: 0, endpoints: 0 },
        };
      },
    },
    {
      name: 'cloud_xds_clusters',
      description:
        'Introspect the CDS clusters the recoder-xds control plane serves (name, discovery type, endpoint count; read-only).',
      handler: async () => {
        const clusters = await xds().clusters();
        return {
          count: clusters.length,
          clusters: clusters.map((c) => ({
            name: c.name,
            type: c.type,
            status: c.status,
            endpoints: c.endpoints,
          })),
        };
      },
    },
    {
      name: 'cloud_xds_routes',
      description:
        'Introspect the RDS route configs the recoder-xds control plane serves (virtual hosts + prefix→cluster routes; read-only).',
      handler: async () => {
        const routes = await xds().routes();
        return {
          count: routes.length,
          routes: routes.map((rc) => ({
            name: rc.name,
            virtualHosts: rc.virtualHosts.map((vh) => ({
              name: vh.name,
              domains: vh.domains,
              routes: vh.routes.map((r) => ({ prefix: r.prefix, cluster: r.cluster })),
            })),
          })),
        };
      },
    },
    {
      name: 'cloud_xds_listeners',
      description:
        'Introspect the LDS listeners the recoder-xds control plane serves (address + ordered HCM HTTP filter chain + RDS route ref; read-only).',
      handler: async () => {
        const listeners = await xds().listeners();
        return {
          count: listeners.length,
          listeners: listeners.map((l) => ({
            name: l.name,
            address: l.address,
            port: l.port,
            filterChains: l.filterChains,
            httpFilters: l.httpFilters,
            routeConfig: l.routeConfig,
          })),
        };
      },
    },
    {
      name: 'cloud_xds_endpoints',
      description:
        'List the upstream endpoints registered under recoder-xds clusters. Status is `registered` — the mesh has no live data plane, so this is served config, not a live health probe (read-only).',
      handler: async () => {
        const endpoints = await xds().endpoints();
        return {
          count: endpoints.length,
          endpoints: endpoints.map((e) => ({
            cluster: e.cluster,
            address: e.address,
            port: e.port,
            status: e.status,
          })),
        };
      },
    },
  ];
}
