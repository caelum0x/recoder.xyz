import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { decideNetworkAuthz, extractAuthzRequest } from '../src/ext-authz';
import type { NetworkAuthzRequest } from '../src/types';
import { governancePolicyAdvisor } from './governance-ports';

const TRUSTED = 'spiffe://recoder.xyz/svc/docker-backend';

/** The real governance engine, injected as the policy advisor port. */
const advisor = governancePolicyAdvisor;

describe('decideNetworkAuthz (default-deny / hostile-by-default)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.NETWORK_TRUSTED_PRINCIPALS;
    delete process.env.NETWORK_PUBLIC_PREFIXES;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('DENIES an unconfigured deployment (no trust, no public prefixes)', () => {
    const req: NetworkAuthzRequest = { method: 'GET', path: '/recoder-app/', headers: {} };
    const d = decideNetworkAuthz(req, advisor);
    expect(d.effect).toBe('deny');
    expect(d.status).toBe(403);
  });

  it('DENIES a request with no principal on a non-public path', () => {
    process.env.NETWORK_PUBLIC_PREFIXES = '/recoder-app/';
    const req: NetworkAuthzRequest = { method: 'GET', path: '/docker-backend/secret', headers: {} };
    const d = decideNetworkAuthz(req, advisor);
    expect(d.effect).toBe('deny');
  });

  it('ALLOWS an anonymous request on an explicitly public prefix (read)', () => {
    process.env.NETWORK_PUBLIC_PREFIXES = '/recoder-app/';
    const req: NetworkAuthzRequest = { method: 'GET', path: '/recoder-app/index.html', headers: {} };
    const d = decideNetworkAuthz(req, advisor);
    expect(d.effect).toBe('allow');
    expect(d.status).toBe(200);
  });

  it('DENIES an unrecognized mTLS principal', () => {
    process.env.NETWORK_TRUSTED_PRINCIPALS = TRUSTED;
    const req: NetworkAuthzRequest = {
      method: 'GET',
      path: '/docker-backend/api',
      headers: {},
      principal: 'spiffe://evil/attacker',
    };
    const d = decideNetworkAuthz(req, advisor);
    expect(d.effect).toBe('deny');
    expect(d.reason).toContain('Unrecognized');
  });

  it('ALLOWS a trusted mTLS principal making a read request', () => {
    process.env.NETWORK_TRUSTED_PRINCIPALS = TRUSTED;
    const req: NetworkAuthzRequest = {
      method: 'GET',
      path: '/docker-backend/api/health',
      headers: {},
      principal: TRUSTED,
      destination: 'docker-backend',
    };
    const d = decideNetworkAuthz(req, advisor);
    expect(d.effect).toBe('allow');
    expect(d.status).toBe(200);
  });

  it('DENIES a mutating (egress) request from an anonymous public caller', () => {
    // A public prefix lets the caller past the principal gate, but a mutating
    // (deploy.preview) action requires allowNetwork, which an anon actor lacks.
    process.env.NETWORK_PUBLIC_PREFIXES = '/recoder-app/';
    const req: NetworkAuthzRequest = {
      method: 'POST',
      path: '/recoder-app/api/mutate',
      headers: {},
      destination: 'recoder-app',
    };
    const d = decideNetworkAuthz(req, advisor);
    expect(d.effect).toBe('deny');
    expect(d.status).toBe(403);
  });

  it('DENIES a structurally malformed request', () => {
    const d = decideNetworkAuthz({ method: '', path: '', headers: {} }, advisor);
    expect(d.effect).toBe('deny');
    expect(d.reason).toContain('Malformed');
  });

  it('produces a stable decisionId per call', () => {
    const req: NetworkAuthzRequest = { method: 'GET', path: '/x', headers: {} };
    const a = decideNetworkAuthz(req, advisor);
    const b = decideNetworkAuthz(req, advisor);
    expect(a.decisionId).toMatch(/^netauthz_/);
    expect(a.decisionId).not.toBe(b.decisionId);
  });
});

describe('extractAuthzRequest', () => {
  it('reads the Envoy original method/path + client-cert principal headers', () => {
    const req = extractAuthzRequest({
      method: 'POST',
      headers: {
        'x-envoy-original-method': 'GET',
        'x-envoy-original-path': '/docker-backend/api/health',
        'x-forwarded-client-cert-uri': TRUSTED,
        'x-forwarded-for': '10.0.0.5, 10.0.0.1',
      },
      originalPath: '/internal/network/authz',
      ip: '127.0.0.1',
    });
    expect(req.method).toBe('GET');
    expect(req.path).toBe('/docker-backend/api/health');
    expect(req.principal).toBe(TRUSTED);
    expect(req.sourceIp).toBe('10.0.0.5');
  });

  it('falls back to the request method/path when Envoy headers are absent', () => {
    const req = extractAuthzRequest({
      method: 'DELETE',
      headers: {},
      originalPath: '/recoder-app/x',
      ip: '203.0.113.7',
    });
    expect(req.method).toBe('DELETE');
    expect(req.path).toBe('/recoder-app/x');
    expect(req.principal).toBeUndefined();
    expect(req.sourceIp).toBe('203.0.113.7');
  });
});
