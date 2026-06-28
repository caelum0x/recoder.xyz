import { describe, it, expect } from 'vitest';
import {
  generateEnvoyConfig,
  emitJson,
  emitYaml,
  defaultNetworkConfig,
  ACCESS_LOG_JSON_FORMAT,
} from './envoy-config';
import type { NetworkConfig } from './types';

function findDeep(obj: unknown, predicate: (node: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = findDeep(item, predicate);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof obj === 'object' && obj !== null) {
    const rec = obj as Record<string, unknown>;
    if (predicate(rec)) return rec;
    for (const value of Object.values(rec)) {
      const hit = findDeep(value, predicate);
      if (hit) return hit;
    }
  }
  return null;
}

describe('generateEnvoyConfig', () => {
  const config = defaultNetworkConfig({});

  it('produces an HTTPS listener with a DownstreamTlsContext transport socket', () => {
    const bootstrap = generateEnvoyConfig(config);
    const json = emitJson(bootstrap);
    expect(json).toContain('DownstreamTlsContext');

    const ts = findDeep(bootstrap, (n) => n.name === 'envoy.transport_sockets.tls' &&
      typeof n.typed_config === 'object');
    expect(ts).not.toBeNull();
    const typed = ts!.typed_config as Record<string, unknown>;
    expect(String(typed['@type'])).toContain('DownstreamTlsContext');
    const common = typed.common_tls_context as Record<string, unknown>;
    const certs = common.tls_certificates as Array<Record<string, unknown>>;
    expect((certs[0].certificate_chain as Record<string, unknown>).filename).toBe(config.tls.certPath);
  });

  it('wires the ext_authz HTTP filter pointing at /internal/network/authz, fail-closed', () => {
    const bootstrap = generateEnvoyConfig(config);
    const filter = findDeep(bootstrap, (n) => n.name === 'envoy.filters.http.ext_authz');
    expect(filter).not.toBeNull();
    const typed = filter!.typed_config as Record<string, unknown>;
    expect(String(typed['@type'])).toContain('ExtAuthz');
    expect(typed.failure_mode_allow).toBe(false);
    const httpSvc = typed.http_service as Record<string, unknown>;
    expect(httpSvc.path_prefix).toBe('/internal/network/authz');
  });

  it('includes a local rate-limit filter and a router filter (router last)', () => {
    const bootstrap = generateEnvoyConfig(config);
    const hcm = findDeep(bootstrap, (n) => n.name === 'envoy.filters.network.http_connection_manager');
    const typed = hcm!.typed_config as Record<string, unknown>;
    const filters = typed.http_filters as Array<Record<string, unknown>>;
    const names = filters.map((f) => f.name);
    expect(names).toContain('envoy.filters.http.local_ratelimit');
    expect(names).toContain('envoy.filters.http.ext_authz');
    expect(names[names.length - 1]).toBe('envoy.filters.http.router');
    // authz must run before the router (default-deny before routing).
    expect(names.indexOf('envoy.filters.http.ext_authz')).toBeLessThan(
      names.indexOf('envoy.filters.http.router'),
    );
  });

  it('emits a cluster for every recoder service plus the ext_authz cluster', () => {
    const bootstrap = generateEnvoyConfig(config);
    const sr = bootstrap.static_resources as Record<string, unknown>;
    const clusters = sr.clusters as Array<Record<string, unknown>>;
    const clusterNames = clusters.map((c) => c.name);
    for (const expected of ['docker-backend', 'recoder-app', 'recoder-agents', 'recoder-pm', 'recoder-agency']) {
      expect(clusterNames).toContain(expected);
    }
    expect(clusterNames).toContain('recoder_ext_authz');
  });

  it('configures a JSON file access-log with the XDR field schema', () => {
    const bootstrap = generateEnvoyConfig(config);
    const al = findDeep(bootstrap, (n) => n.name === 'envoy.access_loggers.file');
    expect(al).not.toBeNull();
    const typed = al!.typed_config as Record<string, unknown>;
    expect(typed.path).toBe(config.accessLog.path);
    const fmt = (typed.log_format as Record<string, unknown>).json_format as Record<string, unknown>;
    expect(Object.keys(fmt)).toEqual(Object.keys(ACCESS_LOG_JSON_FORMAT));
    expect(fmt.response_flags).toBe('%RESPONSE_FLAGS%');
  });

  it('enables mTLS (require_client_certificate) when a client CA is configured', () => {
    const mtls: NetworkConfig = {
      ...config,
      tls: { ...config.tls, clientCaPath: '/etc/envoy/certs/ca.crt' },
    };
    const bootstrap = generateEnvoyConfig(mtls);
    const ts = findDeep(bootstrap, (n) => n.name === 'envoy.transport_sockets.tls' &&
      (n.typed_config as Record<string, unknown>)?.require_client_certificate === true);
    expect(ts).not.toBeNull();
  });

  it('round-trips through JSON emission', () => {
    const bootstrap = generateEnvoyConfig(config);
    const json = emitJson(bootstrap);
    expect(JSON.parse(json)).toEqual(bootstrap);
  });

  it('emits non-empty YAML containing the @type type URLs', () => {
    const bootstrap = generateEnvoyConfig(config);
    const yaml = emitYaml(bootstrap);
    expect(yaml.length).toBeGreaterThan(100);
    expect(yaml).toContain('"@type"');
    expect(yaml).toContain('http_connection_manager');
  });

  it('emits well-formed YAML list items (every "-" has a following space)', () => {
    const yaml = emitYaml(generateEnvoyConfig(config));
    const malformed = yaml.split('\n').filter((line) => /^\s*-[^ ]/.test(line));
    expect(malformed).toEqual([]);
    // sequence items must be present (filters, clusters, listeners)
    expect(yaml.split('\n').some((l) => /^\s*- name:/.test(l))).toBe(true);
  });
});
