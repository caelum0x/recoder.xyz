import { describe, it, expect } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { SessionVerifier } from '../../../domains/identity/ports/session-verifier.port.js';
import type { InteropChain } from '../../../domains/interop/ports/interop-chain.port.js';
import type { EdgeConfig } from '../../../domains/edge/config.js';
import { createChain } from '../chain.js';
import { mockReq, mockRes } from './_mock.js';

const noopLog = {
  info: () => {},
  debug: () => {},
  error: () => {},
  warn: () => {},
  child: () => noopLog,
} as unknown as Logger;

const CONFIG: EdgeConfig = {
  cors: { origins: ['.recoder.xyz'], allowCredentials: true },
  bodyLimit: '1mb',
  rateLimit: {
    api: { maxRequests: 300, windowMs: 60_000, maxConcurrent: 60 },
    heavy: { maxRequests: 30, windowMs: 60_000, maxConcurrent: 8 },
    auth: { maxRequests: 20, windowMs: 60_000, maxConcurrent: 10 },
  },
  ws: { heartbeatMs: 30_000, idleTimeoutMs: 120_000, maxFramesPerWindow: 240, frameWindowMs: 10_000 },
  internalKeyPresent: true,
  internalServiceKey: 'x'.repeat(40),
  isProduction: false,
  shutdownDrainMs: 5_000,
};

const nullVerifier: SessionVerifier = { verify: async () => null };
const admitChain: InteropChain = {
  run: async () => ({ admit: true, effect: 'allow', tier: 'low', reason: 'ok', degraded: false }),
};

function makeChain(verifier: SessionVerifier = nullVerifier) {
  return createChain({ config: CONFIG, logger: noopLog, verifier, interopChain: admitChain });
}

describe('chain — the ONE canonical ordered pipeline', () => {
  it('global chain is context → cors → body → api-rate-limit (4 links)', () => {
    const links = makeChain().buildGlobalChain();
    expect(links).toHaveLength(4);
  });

  it('a public, non-interop mount compiles to an empty guard', () => {
    const links = makeChain().buildGuard({ auth: 'public', interop: false });
    expect(links).toHaveLength(0);
  });

  it('a heavy-tier session mount with interop compiles rate → auth → interop-gate', () => {
    const links = makeChain().buildGuard({ auth: 'session', interop: true, rateLimit: 'heavy' });
    expect(links).toHaveLength(3);
  });

  it('a session guard rejects an unauthenticated request with 401', async () => {
    const links = makeChain().buildGuard({ auth: 'session', interop: false });
    const req = mockReq({ headers: {} });
    const res = mockRes();
    let called = false;
    links[0](req, res, () => {
      called = true;
    });
    await new Promise((r) => setImmediate(r));
    expect(called).toBe(false);
    expect(res.result.statusCode).toBe(401);
    expect((res.result.body as { error: { code: string } }).error.code).toBe('AUTH_REQUIRED');
  });

  it('a session guard attaches the principal and calls next when the verifier resolves', async () => {
    const verifier: SessionVerifier = {
      verify: async () => ({
        userId: 'u1',
        scopes: ['read'],
        kind: 'session',
        isAnonymous: false,
        raw: null,
      }),
    };
    const links = makeChain(verifier).buildGuard({ auth: 'session', interop: false });
    const req = mockReq();
    const res = mockRes();
    let called = false;
    links[0](req, res, () => {
      called = true;
    });
    await new Promise((r) => setImmediate(r));
    expect(called).toBe(true);
    expect(req.principal?.userId).toBe('u1');
  });
});
