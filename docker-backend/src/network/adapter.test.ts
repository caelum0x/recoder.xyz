/**
 * adapter.test.ts — proves the docker-backend ADOPTION of @recoder/network.
 *
 * The pure subsystem lives in @recoder/network and is exhaustively tested there.
 * This suite proves the thin docker-backend adapter wires the REAL
 * @recoder/governance ports through the package end to end:
 *
 *   - governancePolicyAdvisor drives the authz decision (default-deny holds),
 *   - the XDR sink singleton seals detections into the real Merkle chain,
 *   - the re-export surface (index.ts) keeps server.ts's importers intact.
 *
 * Nothing here is a stub: it exercises the same evaluatePolicy + InMemoryAuditStore
 * the production routes use.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  // re-exported pure surface from @recoder/network via ./index
  decideNetworkAuthz,
  extractAuthzRequest,
  type NetworkAuthzRequest,
  // docker-backend adapters
  governancePolicyAdvisor,
  createGovernanceAuditSink,
  getXdrSink,
  __resetXdrSinkForTests,
} from './index.js';
import { XdrSink } from '@recoder/network';

const TRUSTED = 'spiffe://recoder.xyz/svc/docker-backend';

describe('network adapter: authz decision wired through the governance advisor', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.NETWORK_TRUSTED_PRINCIPALS;
    delete process.env.NETWORK_PUBLIC_PREFIXES;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('DENIES an unconfigured deployment (default-deny holds through the adapter)', () => {
    const req: NetworkAuthzRequest = { method: 'GET', path: '/recoder-app/', headers: {} };
    const d = decideNetworkAuthz(req, governancePolicyAdvisor);
    expect(d.effect).toBe('deny');
    expect(d.status).toBe(403);
  });

  it('ALLOWS a trusted mTLS principal read via the real policy engine', () => {
    process.env.NETWORK_TRUSTED_PRINCIPALS = TRUSTED;
    const req = extractAuthzRequest({
      method: 'POST',
      headers: {
        'x-envoy-original-method': 'GET',
        'x-envoy-original-path': '/docker-backend/api/health',
        'x-forwarded-client-cert-uri': TRUSTED,
        'x-recoder-destination': 'docker-backend',
      },
      originalPath: '/internal/network/authz',
      ip: '127.0.0.1',
    });
    const d = decideNetworkAuthz(req, governancePolicyAdvisor);
    expect(d.effect).toBe('allow');
    expect(d.status).toBe(200);
  });
});

describe('network adapter: XDR sink wired to the real governance audit store', () => {
  beforeEach(() => __resetXdrSinkForTests());
  afterEach(() => __resetXdrSinkForTests());

  function authzDenialBurst(): string {
    return Array.from({ length: 6 }, () =>
      JSON.stringify({
        timestamp: '2026-06-28T00:00:00.000Z',
        method: 'GET',
        path: '/docker-backend/api',
        response_code: 403,
        response_flags: 'UAEX',
        source_ip: '10.0.0.5',
      }),
    ).join('\n');
  }

  it('getXdrSink() returns a singleton backed by the governance audit sink', () => {
    const a = getXdrSink();
    const b = getXdrSink();
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(XdrSink);
  });

  it('seals detections into the real Merkle chain and keeps it intact', () => {
    const sink = getXdrSink();
    const result = sink.ingest(authzDenialBurst());
    expect(result.eventsParsed).toBe(6);
    expect(result.detections.length).toBeGreaterThan(0);
    for (const d of result.detections) {
      expect(d.auditHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(sink.verifyChain().ok).toBe(true);
    expect(sink.auditTip()).toBe(result.auditTip);
  });

  it('createGovernanceAuditSink() yields a fresh, independent chain each call', () => {
    const sink1 = new XdrSink(createGovernanceAuditSink());
    const sink2 = new XdrSink(createGovernanceAuditSink());
    sink1.ingest(authzDenialBurst());
    // sink2's chain is untouched (genesis tip), proving independence.
    expect(sink2.auditTip()).not.toBe(sink1.auditTip());
    expect(sink2.recent()).toHaveLength(0);
  });
});
