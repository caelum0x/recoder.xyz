/**
 * envoy-config.ts — pure functions that GENERATE a real, deployable Envoy v3
 * bootstrap config from a NetworkConfig.
 *
 * This is a control plane, not a shim: the emitted object uses the actual Envoy
 * xDS schema shapes (typed_config @type URLs, listeners/filter_chains/clusters/
 * transport_socket) so it can be written to disk and handed to `envoy -c`.
 *
 * Hostile-by-default: the HCM filter chain wires an ext_authz HTTP filter that
 * calls back into Recoder for an allow/deny decision, and a local rate-limit
 * filter. Failure to reach ext_authz is fail-closed unless explicitly overridden.
 *
 * No third-party deps: YAML emission is a small, deterministic serializer over
 * the plain config object (Envoy accepts both YAML and JSON bootstrap configs;
 * the JSON form is a strict subset of YAML, so we also expose emitJson).
 */
import type { NetworkConfig, NetworkUpstream } from './types';

const TYPE_URL = {
  hcm: 'type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager',
  router: 'type.googleapis.com/envoy.extensions.filters.http.router.v3.Router',
  extAuthz: 'type.googleapis.com/envoy.extensions.filters.http.ext_authz.v3.ExtAuthz',
  localRateLimit:
    'type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit',
  downstreamTls:
    'type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.DownstreamTlsContext',
  upstreamTls:
    'type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.UpstreamTlsContext',
  fileAccessLog: 'type.googleapis.com/envoy.extensions.access_loggers.file.v3.FileAccessLog',
} as const;

/**
 * The JSON access-log format string. Envoy substitutes %COMMAND% operators; the
 * XDR parser (xdr/parser.ts) expects exactly these keys.
 */
export const ACCESS_LOG_JSON_FORMAT: Readonly<Record<string, string>> = {
  timestamp: '%START_TIME%',
  method: '%REQ(:METHOD)%',
  path: '%REQ(X-ENVOY-ORIGINAL-PATH?:PATH)%',
  response_code: '%RESPONSE_CODE%',
  response_flags: '%RESPONSE_FLAGS%',
  source_ip: '%DOWNSTREAM_REMOTE_ADDRESS_WITHOUT_PORT%',
  principal: '%DOWNSTREAM_PEER_URI_SAN%',
  upstream: '%UPSTREAM_CLUSTER%',
  bytes_sent: '%BYTES_SENT%',
  duration_ms: '%DURATION%',
};

/** A typed Envoy bootstrap config object. Kept structural (Record) on purpose:
 *  Envoy's schema is large and version-specific; we assert the load-bearing
 *  shapes in tests rather than re-deriving the entire proto in TS. */
export type EnvoyBootstrap = Record<string, unknown>;

function buildTransportSocketDownstream(config: NetworkConfig): Record<string, unknown> {
  const { tls } = config;
  const commonTls: Record<string, unknown> = {
    tls_certificates: [
      {
        certificate_chain: { filename: tls.certPath },
        private_key: { filename: tls.keyPath },
      },
    ],
    tls_params: {
      tls_minimum_protocol_version: tls.minVersion ?? 'TLSv1_2',
    },
  };

  const downstreamCtx: Record<string, unknown> = {
    common_tls_context: commonTls,
  };

  // mTLS: require + verify the client certificate against the trusted CA bundle.
  if (tls.clientCaPath) {
    (commonTls as Record<string, unknown>).validation_context = {
      trusted_ca: { filename: tls.clientCaPath },
    };
    downstreamCtx.require_client_certificate = true;
  }

  return {
    name: 'envoy.transport_sockets.tls',
    typed_config: {
      '@type': TYPE_URL.downstreamTls,
      ...downstreamCtx,
    },
  };
}

function buildExtAuthzFilter(config: NetworkConfig): Record<string, unknown> {
  const { extAuthz } = config;
  return {
    name: 'envoy.filters.http.ext_authz',
    typed_config: {
      '@type': TYPE_URL.extAuthz,
      transport_api_version: 'V3',
      // Fail-closed by default: if the authz service is unreachable, DENY.
      failure_mode_allow: extAuthz.failureModeAllow ?? false,
      http_service: {
        server_uri: {
          uri: `http://${extAuthz.host}:${extAuthz.port}`,
          cluster: extAuthz.cluster,
          timeout: `${(extAuthz.timeoutMs / 1000).toFixed(3)}s`,
        },
        path_prefix: extAuthz.path,
        authorization_request: {
          allowed_headers: {
            patterns: [
              { exact: 'authorization', ignore_case: true },
              { exact: 'x-recoder-actor', ignore_case: true },
              { exact: 'x-recoder-task', ignore_case: true },
              { prefix: 'x-forwarded-' },
            ],
          },
        },
        authorization_response: {
          allowed_upstream_headers: {
            patterns: [{ exact: 'x-recoder-decision', ignore_case: true }],
          },
        },
      },
    },
  };
}

function buildLocalRateLimitFilter(config: NetworkConfig): Record<string, unknown> {
  const { rateLimit } = config;
  return {
    name: 'envoy.filters.http.local_ratelimit',
    typed_config: {
      '@type': TYPE_URL.localRateLimit,
      stat_prefix: 'recoder_http_local_rate_limiter',
      token_bucket: {
        max_tokens: rateLimit.maxTokens,
        tokens_per_fill: rateLimit.tokensPerFill,
        fill_interval: `${(rateLimit.fillIntervalMs / 1000).toFixed(3)}s`,
      },
      filter_enabled: {
        runtime_key: 'local_rate_limit_enabled',
        default_value: { numerator: 100, denominator: 'HUNDRED' },
      },
      filter_enforced: {
        runtime_key: 'local_rate_limit_enforced',
        default_value: { numerator: 100, denominator: 'HUNDRED' },
      },
    },
  };
}

function buildAccessLog(config: NetworkConfig): Record<string, unknown> {
  return {
    name: 'envoy.access_loggers.file',
    typed_config: {
      '@type': TYPE_URL.fileAccessLog,
      path: config.accessLog.path,
      log_format: {
        json_format: { ...ACCESS_LOG_JSON_FORMAT },
      },
    },
  };
}

function buildRoute(upstream: NetworkUpstream): Record<string, unknown> {
  // Route by host header: <cluster>.recoder maps to the cluster. We also expose
  // a path prefix /<name>/ for path-based routing behind a single vhost.
  return {
    match: { prefix: `/${upstream.name}/` },
    route: {
      cluster: upstream.name,
      prefix_rewrite: '/',
      ...(upstream.hostHeader ? { host_rewrite_literal: upstream.hostHeader } : {}),
    },
  };
}

function buildHcmFilter(config: NetworkConfig): Record<string, unknown> {
  const routes = config.upstreams.map(buildRoute);
  return {
    name: 'envoy.filters.network.http_connection_manager',
    typed_config: {
      '@type': TYPE_URL.hcm,
      stat_prefix: 'recoder_ingress_http',
      codec_type: 'AUTO',
      access_log: [buildAccessLog(config)],
      route_config: {
        name: 'recoder_local_route',
        virtual_hosts: [
          {
            name: 'recoder_backend',
            domains: ['*'],
            routes,
          },
        ],
      },
      // Order matters: rate-limit, then authz (default-deny), then router last.
      http_filters: [
        buildLocalRateLimitFilter(config),
        buildExtAuthzFilter(config),
        {
          name: 'envoy.filters.http.router',
          typed_config: { '@type': TYPE_URL.router },
        },
      ],
    },
  };
}

function buildUpstreamCluster(upstream: NetworkUpstream): Record<string, unknown> {
  const cluster: Record<string, unknown> = {
    name: upstream.name,
    type: 'STRICT_DNS',
    connect_timeout: '1s',
    lb_policy: 'ROUND_ROBIN',
    load_assignment: {
      cluster_name: upstream.name,
      endpoints: [
        {
          lb_endpoints: [
            {
              endpoint: {
                address: {
                  socket_address: { address: upstream.host, port_value: upstream.port },
                },
              },
            },
          ],
        },
      ],
    },
  };

  if (upstream.tlsUpstream) {
    cluster.transport_socket = {
      name: 'envoy.transport_sockets.tls',
      typed_config: {
        '@type': TYPE_URL.upstreamTls,
        sni: upstream.hostHeader ?? upstream.host,
      },
    };
  }

  return cluster;
}

function buildExtAuthzCluster(config: NetworkConfig): Record<string, unknown> {
  const { extAuthz } = config;
  return {
    name: extAuthz.cluster,
    type: 'STRICT_DNS',
    connect_timeout: '1s',
    lb_policy: 'ROUND_ROBIN',
    load_assignment: {
      cluster_name: extAuthz.cluster,
      endpoints: [
        {
          lb_endpoints: [
            {
              endpoint: {
                address: {
                  socket_address: { address: extAuthz.host, port_value: extAuthz.port },
                },
              },
            },
          ],
        },
      ],
    },
  };
}

/**
 * Generate the full Envoy bootstrap config object from a NetworkConfig.
 * Pure + deterministic. The returned object is a valid Envoy v3 bootstrap.
 */
export function generateEnvoyConfig(config: NetworkConfig): EnvoyBootstrap {
  const clusters = [
    ...config.upstreams.map(buildUpstreamCluster),
    buildExtAuthzCluster(config),
  ];

  return {
    admin: {
      address: {
        socket_address: { address: config.adminAddress, port_value: config.adminPort },
      },
    },
    static_resources: {
      listeners: [
        {
          name: 'recoder_https_listener',
          address: {
            socket_address: { address: config.listenAddress, port_value: config.listenPort },
          },
          filter_chains: [
            {
              filters: [buildHcmFilter(config)],
              transport_socket: buildTransportSocketDownstream(config),
            },
          ],
        },
      ],
      clusters,
    },
  };
}

// --- Emission --------------------------------------------------------------

/** Emit the config as canonical JSON (Envoy accepts a JSON bootstrap). */
export function emitJson(bootstrap: EnvoyBootstrap): string {
  return JSON.stringify(bootstrap, null, 2);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function yamlScalar(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  const str = String(value);
  // Quote when the scalar could be misread as YAML (special chars, leading
  // symbols, @type URLs, empty, or boolean/number look-alikes).
  if (
    str === '' ||
    /^[\s@&*!|>%#`?{}\[\],:]/.test(str) ||
    /[:#]/.test(str) ||
    /^(true|false|null|~|-?\d)/i.test(str)
  ) {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return str;
}

function emitYamlNode(value: unknown, indent: number): string {
  const pad = '  '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return ' []';
    const childPad = '  '.repeat(indent + 1);
    return (
      '\n' +
      value
        .map((item) => {
          if (isPlainObject(item) || Array.isArray(item)) {
            // Render the child at indent+1, then hang the first line on "- " by
            // replacing the leading pad of the first emitted line with "- ".
            const inner = emitYamlNode(item, indent + 1).replace(/^\n/, '');
            const lines = inner.split('\n');
            lines[0] = `${pad}- ${lines[0].slice(childPad.length)}`;
            return lines.join('\n');
          }
          return `${pad}- ${yamlScalar(item)}`;
        })
        .join('\n')
    );
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return ' {}';
    return (
      '\n' +
      keys
        .map((key) => {
          const child = value[key];
          if (isPlainObject(child) || Array.isArray(child)) {
            return `${pad}${yamlScalar(key)}:${emitYamlNode(child, indent + 1)}`;
          }
          return `${pad}${yamlScalar(key)}: ${yamlScalar(child)}`;
        })
        .join('\n')
    );
  }

  return ` ${yamlScalar(value)}`;
}

/**
 * Emit the config as YAML. Deterministic, dependency-free. Round-trips through
 * JSON.parse(emitJson(...)) === structurally equal; tests assert key shapes.
 */
export function emitYaml(bootstrap: EnvoyBootstrap): string {
  const body = emitYamlNode(bootstrap, 0).replace(/^\n/, '');
  return `${body}\n`;
}

/**
 * The default production-shaped NetworkConfig for the recoder service mesh.
 * Hosts/ports match the documented surfaces; TLS/CA paths are container paths.
 * Env-overridable so deploys can point at real cert material without code edits.
 */
export function defaultNetworkConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): NetworkConfig {
  const authzHost = env.NETWORK_AUTHZ_HOST ?? 'docker-backend';
  const authzPort = Number(env.NETWORK_AUTHZ_PORT ?? '3100');

  return {
    adminAddress: '127.0.0.1',
    adminPort: Number(env.ENVOY_ADMIN_PORT ?? '9901'),
    listenAddress: '0.0.0.0',
    listenPort: Number(env.ENVOY_LISTEN_PORT ?? '8443'),
    tls: {
      certPath: env.ENVOY_TLS_CERT ?? '/etc/envoy/certs/server.crt',
      keyPath: env.ENVOY_TLS_KEY ?? '/etc/envoy/certs/server.key',
      clientCaPath: env.ENVOY_MTLS_CA, // optional: enables mTLS when present
      minVersion: 'TLSv1_2',
    },
    upstreams: [
      { name: 'docker-backend', host: env.SVC_DOCKER_BACKEND_HOST ?? 'docker-backend', port: 3100 },
      { name: 'recoder-app', host: env.SVC_RECODER_APP_HOST ?? 'recoder-app', port: 3000 },
    ],
    extAuthz: {
      cluster: 'recoder_ext_authz',
      host: authzHost,
      port: authzPort,
      path: '/internal/network/authz',
      timeoutMs: Number(env.NETWORK_AUTHZ_TIMEOUT_MS ?? '500'),
      failureModeAllow: false, // hostile-by-default: fail closed
    },
    rateLimit: {
      maxTokens: Number(env.NETWORK_RL_MAX_TOKENS ?? '200'),
      tokensPerFill: Number(env.NETWORK_RL_TOKENS_PER_FILL ?? '200'),
      fillIntervalMs: Number(env.NETWORK_RL_FILL_INTERVAL_MS ?? '1000'),
    },
    accessLog: {
      path: env.ENVOY_ACCESS_LOG ?? '/var/log/envoy/access.json.log',
    },
  };
}
