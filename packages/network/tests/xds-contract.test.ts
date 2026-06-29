import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  generateXdsBootstrap,
  defaultXdsEndpoint,
  XDS_NODE_ID,
  LISTENER_NAME,
  ROUTE_CONFIG_NAME,
  VIRTUAL_HOST_NAME,
  XDS_CLUSTER_NAME,
  XDS_DEFAULT_SERVICE_HOST,
  XDS_DEFAULT_SERVICE_PORT,
} from '../src/xds-contract';
import { generateEnvoyConfig, defaultNetworkConfig } from '../src/envoy-config';

/**
 * The Go xDS control plane (go/recoder-xds) writes its canonical name contract
 * to internal/contract/contract.json (guarded there by a Go golden test). This
 * suite reads those exact bytes and asserts the TypeScript constants in
 * xds-contract.ts agree — so a name change on either side fails CI on both.
 */
interface GoContract {
  nodeId: string;
  listenerName: string;
  routeConfigName: string;
  virtualHostName: string;
  extAuthzClusterName: string;
  hcmStatPrefix: string;
  rateLimitStatPrefix: string;
  httpFilterOrder: string[];
}

const here = dirname(fileURLToPath(import.meta.url));
const goContractPath = resolve(
  here,
  '../../../go/recoder-xds/internal/contract/contract.json',
);
const goContract = JSON.parse(readFileSync(goContractPath, 'utf8')) as GoContract;

describe('cross-language xDS contract (TS <-> Go recoder-xds)', () => {
  it('TS constants match the Go control-plane contract.json byte-for-byte', () => {
    expect(XDS_NODE_ID).toBe(goContract.nodeId);
    expect(LISTENER_NAME).toBe(goContract.listenerName);
    expect(ROUTE_CONFIG_NAME).toBe(goContract.routeConfigName);
    expect(VIRTUAL_HOST_NAME).toBe(goContract.virtualHostName);
  });

  it('the default ext_authz cluster name agrees with the Go contract', () => {
    const cfg = defaultNetworkConfig({});
    expect(cfg.extAuthz.cluster).toBe(goContract.extAuthzClusterName);
  });

  it('the static bootstrap names match the names the Go control plane serves', () => {
    // The dynamic control plane must serve resources under the SAME names the
    // static generator emits, or swapping a one-shot `envoy -c` boot for the
    // ADS path would change listener/route/cluster identity.
    const cfg = defaultNetworkConfig({});
    const bootstrap = generateEnvoyConfig(cfg);
    const sr = bootstrap.static_resources as Record<string, unknown>;
    const listeners = sr.listeners as Array<Record<string, unknown>>;
    expect(listeners[0].name).toBe(goContract.listenerName);

    const filterChains = listeners[0].filter_chains as Array<Record<string, unknown>>;
    const hcm = (filterChains[0].filters as Array<Record<string, unknown>>)[0];
    const typed = hcm.typed_config as Record<string, unknown>;
    const routeConfig = typed.route_config as Record<string, unknown>;
    expect(routeConfig.name).toBe(goContract.routeConfigName);
    const vhosts = routeConfig.virtual_hosts as Array<Record<string, unknown>>;
    expect(vhosts[0].name).toBe(goContract.virtualHostName);

    // HTTP filter order must equal the contract (rate-limit, authz, router).
    const filters = typed.http_filters as Array<Record<string, unknown>>;
    expect(filters.map((f) => f.name)).toEqual(goContract.httpFilterOrder);
  });
});

describe('generateXdsBootstrap (the ADS-consuming Envoy bootstrap)', () => {
  const cfg = defaultNetworkConfig({});

  it('pins node.id and node.cluster to the control-plane NodeID', () => {
    const boot = generateXdsBootstrap(cfg);
    const node = boot.node as Record<string, unknown>;
    expect(node.id).toBe(XDS_NODE_ID);
    expect(node.id).toBe(goContract.nodeId);
    expect(node.cluster).toBe(XDS_NODE_ID);
  });

  it('configures ADS with CDS and LDS delivered over the same stream', () => {
    const boot = generateXdsBootstrap(cfg);
    const dr = boot.dynamic_resources as Record<string, unknown>;

    const ads = dr.ads_config as Record<string, unknown>;
    expect(ads.api_type).toBe('GRPC');
    expect(ads.transport_api_version).toBe('V3');
    const grpc = (ads.grpc_services as Array<Record<string, unknown>>)[0];
    const envoyGrpc = grpc.envoy_grpc as Record<string, unknown>;
    expect(envoyGrpc.cluster_name).toBe(XDS_CLUSTER_NAME);

    // CDS + LDS must both reference ADS (so the control plane drives them).
    expect((dr.cds_config as Record<string, unknown>).ads).toEqual({});
    expect((dr.lds_config as Record<string, unknown>).ads).toEqual({});
  });

  it('emits exactly one static cluster: the HTTP/2 xds_cluster to the control plane', () => {
    const boot = generateXdsBootstrap(cfg);
    const sr = boot.static_resources as Record<string, unknown>;
    const clusters = sr.clusters as Array<Record<string, unknown>>;
    // No inlined upstream/listener resources: those arrive via CDS/LDS/RDS.
    expect(clusters).toHaveLength(1);
    const xds = clusters[0];
    expect(xds.name).toBe(XDS_CLUSTER_NAME);
    expect(xds.type).toBe('STRICT_DNS');

    // gRPC/ADS needs HTTP/2 explicitly declared.
    const opts = xds.typed_extension_protocol_options as Record<string, unknown>;
    const http = opts['envoy.extensions.upstreams.http.v3.HttpProtocolOptions'] as Record<
      string,
      unknown
    >;
    expect(String(http['@type'])).toContain('HttpProtocolOptions');
    const explicit = http.explicit_http_config as Record<string, unknown>;
    expect(explicit.http2_protocol_options).toEqual({});

    // Endpoint defaults to the documented recoder-xds:18000.
    const la = xds.load_assignment as Record<string, unknown>;
    const eps = la.endpoints as Array<Record<string, unknown>>;
    const lb = (eps[0].lb_endpoints as Array<Record<string, unknown>>)[0];
    const ep = lb.endpoint as Record<string, unknown>;
    const addr = (ep.address as Record<string, unknown>).socket_address as Record<string, unknown>;
    expect(addr.address).toBe(XDS_DEFAULT_SERVICE_HOST);
    expect(addr.port_value).toBe(XDS_DEFAULT_SERVICE_PORT);
  });

  it('honors XDS_SERVICE_HOST/PORT env overrides for the control-plane endpoint', () => {
    const endpoint = defaultXdsEndpoint({ XDS_SERVICE_HOST: 'xds.internal', XDS_SERVICE_PORT: '9000' });
    const boot = generateXdsBootstrap(cfg, endpoint);
    const sr = boot.static_resources as Record<string, unknown>;
    const clusters = sr.clusters as Array<Record<string, unknown>>;
    const la = clusters[0].load_assignment as Record<string, unknown>;
    const eps = la.endpoints as Array<Record<string, unknown>>;
    const lb = (eps[0].lb_endpoints as Array<Record<string, unknown>>)[0];
    const ep = lb.endpoint as Record<string, unknown>;
    const addr = (ep.address as Record<string, unknown>).socket_address as Record<string, unknown>;
    expect(addr.address).toBe('xds.internal');
    expect(addr.port_value).toBe(9000);
  });

  it('carries an admin interface from the NetworkConfig', () => {
    const boot = generateXdsBootstrap(cfg);
    const admin = boot.admin as Record<string, unknown>;
    const addr = (admin.address as Record<string, unknown>).socket_address as Record<string, unknown>;
    expect(addr.address).toBe(cfg.adminAddress);
    expect(addr.port_value).toBe(cfg.adminPort);
  });
});
