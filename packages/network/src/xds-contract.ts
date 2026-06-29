/**
 * xds-contract.ts — the cross-language contract between this package and the
 * owned Go xDS control plane (`go/recoder-xds`).
 *
 * `envoy-config.ts` emits a fully STATIC Envoy bootstrap (every listener,
 * cluster and route inlined) for a one-shot `envoy -c` boot. That cannot push
 * live changes. The Go control plane (`recoder-xds`, go-control-plane v0.14.0)
 * serves the DYNAMIC equivalent of the same `NetworkConfig` over ADS gRPC
 * (LDS/CDS/RDS), so a running Envoy gets live updates without a restart.
 *
 * For a deployed Envoy to actually CONSUME that control plane it needs a
 * different bootstrap: a `node.id` that matches the control plane's node key,
 * an `ads_config` pointing at the xDS gRPC endpoint, and `cds_config` /
 * `lds_config` set to `{ ads: {} }`. This module is the single source of truth
 * for that wiring on the TS side, and the constants below are asserted equal to
 * the Go `recoder-xds` constants by the contract tests on both sides.
 *
 * The names here MUST stay byte-identical to:
 *   - go/recoder-xds/internal/server/server.go    (NodeID)
 *   - go/recoder-xds/internal/snapshot/builder.go (ListenerName / RouteConfigName / VirtualHostName)
 * Changing one without the other silently breaks the data plane <-> control
 * plane handshake, so the contract tests fail fast on any drift.
 */
import type { NetworkConfig } from './types';
import type { EnvoyBootstrap } from './envoy-config';

/**
 * The Envoy `node.id` (and `node.cluster`) the control plane keys its single
 * logical snapshot under. MUST equal `server.NodeID` in the Go control plane.
 * With ADS + a single-node mesh, every Envoy shares this one snapshot id.
 */
export const XDS_NODE_ID = 'recoder-mesh';

/** LDS listener name. MUST equal `snapshot.ListenerName` in Go. */
export const LISTENER_NAME = 'recoder_https_listener';

/** RDS route configuration name. MUST equal `snapshot.RouteConfigName` in Go. */
export const ROUTE_CONFIG_NAME = 'recoder_local_route';

/** Catch-all virtual host name. MUST equal `snapshot.VirtualHostName` in Go. */
export const VIRTUAL_HOST_NAME = 'recoder_backend';

/**
 * The static cluster name the consuming Envoy uses to reach the xDS gRPC
 * control plane itself. This is data-plane-local bootstrap wiring (not an xDS
 * resource), so it is named here rather than served by the control plane.
 */
export const XDS_CLUSTER_NAME = 'xds_cluster';

/** Default xDS gRPC service name the control plane listens on (recoder-xds). */
export const XDS_DEFAULT_SERVICE_HOST = 'recoder-xds';

/** Default xDS gRPC port (matches `XDS_LISTEN_ADDR` default `:18000`). */
export const XDS_DEFAULT_SERVICE_PORT = 18000;

const HTTP2_PROTOCOL_OPTIONS_TYPE =
  'type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions';

/** Where the xDS control plane gRPC endpoint lives, for the bootstrap. */
export interface XdsControlPlaneEndpoint {
  /** Host of the xDS gRPC server (DNS name / docker service). */
  readonly host: string;
  /** Port of the xDS gRPC server. */
  readonly port: number;
}

/** Resolve the control-plane endpoint from env, falling back to documented defaults. */
export function defaultXdsEndpoint(
  env: Readonly<Record<string, string | undefined>> = process.env,
): XdsControlPlaneEndpoint {
  return {
    host: env.XDS_SERVICE_HOST ?? XDS_DEFAULT_SERVICE_HOST,
    port: Number(env.XDS_SERVICE_PORT ?? String(XDS_DEFAULT_SERVICE_PORT)),
  };
}

/**
 * Generate the Envoy bootstrap that makes a running Envoy CONSUME the Go xDS
 * control plane over ADS. Unlike `generateEnvoyConfig`, this emits NO inlined
 * listeners/upstream clusters: those arrive dynamically via LDS/CDS/RDS. The
 * only static resource is the `xds_cluster` used to reach the control plane.
 *
 * Pure + deterministic. The `node.id` and `node.cluster` are pinned to
 * {@link XDS_NODE_ID} so the snapshot the control plane keyed under that id is
 * the one this Envoy receives.
 *
 * @param config   The NetworkConfig (used for the admin interface address).
 * @param endpoint Where the xDS gRPC control plane is reachable.
 */
export function generateXdsBootstrap(
  config: NetworkConfig,
  endpoint: XdsControlPlaneEndpoint = defaultXdsEndpoint(),
): EnvoyBootstrap {
  return {
    node: {
      id: XDS_NODE_ID,
      cluster: XDS_NODE_ID,
    },
    admin: {
      address: {
        socket_address: { address: config.adminAddress, port_value: config.adminPort },
      },
    },
    dynamic_resources: {
      ads_config: {
        api_type: 'GRPC',
        transport_api_version: 'V3',
        grpc_services: [{ envoy_grpc: { cluster_name: XDS_CLUSTER_NAME } }],
      },
      cds_config: { ads: {}, resource_api_version: 'V3' },
      lds_config: { ads: {}, resource_api_version: 'V3' },
    },
    static_resources: {
      clusters: [
        {
          name: XDS_CLUSTER_NAME,
          type: 'STRICT_DNS',
          connect_timeout: '1s',
          // The control-plane gRPC stream is HTTP/2; declare it explicitly so
          // go-control-plane's ADS server accepts the long-lived stream.
          typed_extension_protocol_options: {
            'envoy.extensions.upstreams.http.v3.HttpProtocolOptions': {
              '@type': HTTP2_PROTOCOL_OPTIONS_TYPE,
              explicit_http_config: { http2_protocol_options: {} },
            },
          },
          load_assignment: {
            cluster_name: XDS_CLUSTER_NAME,
            endpoints: [
              {
                lb_endpoints: [
                  {
                    endpoint: {
                      address: {
                        socket_address: { address: endpoint.host, port_value: endpoint.port },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  };
}
