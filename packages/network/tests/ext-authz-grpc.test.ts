import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  handleCheck,
  handleCheckAsync,
  checkRequestToAuthz,
  decisionToCheckResponse,
  buildAccessLogRecord,
  formatAccessLogLine,
  accessLogRecordToEvent,
  GRPC_STATUS_OK,
  GRPC_STATUS_PERMISSION_DENIED,
  DECISION_ID_HEADER,
  type EnvoyCheckRequest,
} from '../src/ext-authz-grpc';
import { DECISION_HEADER } from '../src/ext-authz';
import type { PolicyAdvisorPort } from '../src/ports';
import { governancePolicyAdvisor } from './governance-ports';

const TRUSTED = 'spiffe://recoder.xyz/svc/docker-backend';
const advisor = governancePolicyAdvisor;

/** A policy advisor that ALWAYS throws — to prove the handler fails closed. */
const throwingAdvisor: PolicyAdvisorPort = {
  evaluate() {
    throw new Error('policy engine unreachable (simulated timeout)');
  },
};

/** Build a minimal but real Envoy v3 CheckRequest. */
function checkReq(over: {
  method?: string;
  path?: string;
  principal?: string;
  headers?: Record<string, string>;
  sourceIp?: string;
  destination?: string;
}): EnvoyCheckRequest {
  return {
    attributes: {
      source: {
        principal: over.principal,
        address: over.sourceIp
          ? { socketAddress: { address: over.sourceIp, portValue: 41000 } }
          : undefined,
      },
      destination: over.destination ? { service: over.destination } : undefined,
      request: {
        http: {
          method: over.method ?? 'GET',
          path: over.path ?? '/recoder-app/',
          headers: over.headers ?? {},
        },
      },
    },
  };
}

describe('checkRequestToAuthz (Envoy v3 CheckRequest mapping)', () => {
  it('maps method/path/principal/source from the attribute context', () => {
    const authz = checkRequestToAuthz(
      checkReq({ method: 'post', path: '/docker-backend/x?a=1', principal: TRUSTED, sourceIp: '10.0.0.5' }),
    );
    expect(authz.method).toBe('POST');
    expect(authz.path).toBe('/docker-backend/x'); // query stripped
    expect(authz.principal).toBe(TRUSTED);
    expect(authz.sourceIp).toBe('10.0.0.5');
  });

  it('prefers the structured peer principal over a forged XFCC header', () => {
    const authz = checkRequestToAuthz(
      checkReq({
        principal: TRUSTED,
        headers: { 'x-forwarded-client-cert-uri': 'spiffe://evil/attacker' },
      }),
    );
    expect(authz.principal).toBe(TRUSTED);
  });

  it('treats a request with no principal anywhere as anonymous', () => {
    const authz = checkRequestToAuthz(checkReq({}));
    expect(authz.principal).toBeUndefined();
  });

  it('lower-cases headers and reads x-forwarded-for over the socket addr', () => {
    const authz = checkRequestToAuthz(
      checkReq({ sourceIp: '172.16.0.1', headers: { 'X-Forwarded-For': '10.0.0.9, 10.0.0.1' } }),
    );
    expect(authz.headers['x-forwarded-for']).toBe('10.0.0.9, 10.0.0.1');
    expect(authz.sourceIp).toBe('10.0.0.9');
  });
});

describe('handleCheck — ALLOW / DENY (Envoy v3 CheckResponse)', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    delete process.env.NETWORK_TRUSTED_PRINCIPALS;
    delete process.env.NETWORK_PUBLIC_PREFIXES;
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('ALLOWS a trusted principal read => status OK (0) + ok_response', () => {
    process.env.NETWORK_TRUSTED_PRINCIPALS = TRUSTED;
    const { response, decision } = handleCheck(
      checkReq({ method: 'GET', path: '/docker-backend/api/health', principal: TRUSTED, destination: 'docker-backend' }),
      advisor,
    );
    expect(decision.effect).toBe('allow');
    expect(response.status.code).toBe(GRPC_STATUS_OK);
    expect(response.okResponse).toBeDefined();
    expect(response.deniedResponse).toBeUndefined();
    const hdr = response.okResponse!.headers!.find((h) => h.header.key === DECISION_HEADER);
    expect(hdr!.header.value).toBe('allow');
  });

  it('DENIES an unconfigured deployment => PERMISSION_DENIED (7) + denied 403', () => {
    const { response, decision } = handleCheck(
      checkReq({ method: 'GET', path: '/recoder-app/' }),
      advisor,
    );
    expect(decision.effect).toBe('deny');
    expect(response.status.code).toBe(GRPC_STATUS_PERMISSION_DENIED);
    expect(response.deniedResponse).toBeDefined();
    expect(response.deniedResponse!.status.code).toBe(403);
    expect(response.okResponse).toBeUndefined();
    // The decision id is carried for audit correlation.
    const idHdr = response.deniedResponse!.headers!.find((h) => h.header.key === DECISION_ID_HEADER);
    expect(idHdr!.header.value).toMatch(/^netauthz_/);
  });

  it('DENIES an unrecognized mTLS principal', () => {
    process.env.NETWORK_TRUSTED_PRINCIPALS = TRUSTED;
    const { response, decision } = handleCheck(
      checkReq({ principal: 'spiffe://evil/attacker', path: '/docker-backend/api' }),
      advisor,
    );
    expect(decision.effect).toBe('deny');
    expect(decision.reason).toContain('Unrecognized');
    expect(response.status.code).toBe(GRPC_STATUS_PERMISSION_DENIED);
  });

  it('never leaks policy internals in the denied body', () => {
    const { response } = handleCheck(checkReq({ path: '/recoder-app/' }), advisor);
    expect(response.deniedResponse!.body).toBe('Forbidden');
  });
});

describe('handleCheck — FAIL CLOSED', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.NETWORK_TRUSTED_PRINCIPALS = TRUSTED;
    delete process.env.NETWORK_PUBLIC_PREFIXES;
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('DENIES when the policy advisor THROWS (fail-closed), for an otherwise-allowable request', () => {
    // A trusted principal read would normally ALLOW. With a throwing advisor it
    // MUST deny — fail closed, never allow on a port error/timeout.
    const req = checkReq({
      method: 'GET',
      path: '/docker-backend/api/health',
      principal: TRUSTED,
      destination: 'docker-backend',
    });
    const { response, decision } = handleCheck(req, throwingAdvisor);
    expect(decision.effect).toBe('deny');
    expect(decision.reason).toContain('fail-closed');
    expect(response.status.code).toBe(GRPC_STATUS_PERMISSION_DENIED);
    expect(response.okResponse).toBeUndefined();
    expect(response.deniedResponse!.status.code).toBe(403);
  });

  it('DENIES a completely empty CheckRequest (no attributes) without throwing', () => {
    const { response, decision } = handleCheck({}, advisor);
    expect(decision.effect).toBe('deny');
    expect(response.status.code).toBe(GRPC_STATUS_PERMISSION_DENIED);
  });

  it('async wrapper also fails closed on a throwing advisor', async () => {
    process.env.NETWORK_TRUSTED_PRINCIPALS = TRUSTED;
    const { response, decision } = await handleCheckAsync(
      checkReq({ principal: TRUSTED, path: '/docker-backend/api/health', destination: 'docker-backend' }),
      throwingAdvisor,
    );
    expect(decision.effect).toBe('deny');
    expect(response.status.code).toBe(GRPC_STATUS_PERMISSION_DENIED);
  });

  it('a throwing log sink never changes the outcome and never throws', () => {
    process.env.NETWORK_TRUSTED_PRINCIPALS = TRUSTED;
    expect(() =>
      handleCheck(
        checkReq({ principal: TRUSTED, path: '/docker-backend/api/health', destination: 'docker-backend' }),
        advisor,
        () => {
          throw new Error('disk full');
        },
      ),
    ).not.toThrow();
  });
});

describe('handleCheck — access log emission', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    delete process.env.NETWORK_TRUSTED_PRINCIPALS;
    delete process.env.NETWORK_PUBLIC_PREFIXES;
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('emits exactly one JSON access-log line per check, parseable as the XDR feed', () => {
    const lines: string[] = [];
    handleCheck(checkReq({ method: 'GET', path: '/recoder-app/', sourceIp: '10.0.0.5' }), advisor, (l) =>
      lines.push(l),
    );
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.response_code).toBe(403);
    expect(parsed.response_flags).toBe('UAEX'); // ext_authz denial flag
    expect(parsed.source_ip).toBe('10.0.0.5');
    expect(typeof parsed.decision_id).toBe('string');
  });

  it('an ALLOW emits a benign access-log line (no UAEX flag)', () => {
    process.env.NETWORK_TRUSTED_PRINCIPALS = TRUSTED;
    const record = buildAccessLogRecord(
      checkRequestToAuthz(checkReq({ principal: TRUSTED, path: '/docker-backend/api/health', destination: 'docker-backend' })),
      { effect: 'allow', status: 200, reason: 'ok', decisionId: 'netauthz_x' },
    );
    expect(record.response_code).toBe(200);
    expect(record.response_flags).toBe('-');
    const ev = accessLogRecordToEvent(record);
    expect(ev.responseFlags).toBeUndefined();
    expect(ev.principal).toBe(TRUSTED);
  });

  it('formatAccessLogLine round-trips a record through JSON', () => {
    const rec = buildAccessLogRecord(
      { method: 'GET', path: '/x', headers: {}, sourceIp: '1.2.3.4' },
      { effect: 'deny', status: 403, reason: 'nope', decisionId: 'netauthz_y' },
      '2026-06-28T00:00:00.000Z',
    );
    const round = JSON.parse(formatAccessLogLine(rec));
    expect(round.timestamp).toBe('2026-06-28T00:00:00.000Z');
    expect(round.path).toBe('/x');
    expect(round.reason).toBe('nope');
  });
});

describe('decisionToCheckResponse', () => {
  it('shapes an allow decision into an OK ok_response', () => {
    const r = decisionToCheckResponse({ effect: 'allow', status: 200, reason: 'ok', decisionId: 'd1' });
    expect(r.status.code).toBe(GRPC_STATUS_OK);
    expect(r.okResponse).toBeDefined();
  });

  it('shapes a deny decision into a PERMISSION_DENIED denied_response carrying the HTTP status', () => {
    const r = decisionToCheckResponse({ effect: 'deny', status: 403, reason: 'no', decisionId: 'd2' });
    expect(r.status.code).toBe(GRPC_STATUS_PERMISSION_DENIED);
    expect(r.deniedResponse!.status.code).toBe(403);
  });
});
