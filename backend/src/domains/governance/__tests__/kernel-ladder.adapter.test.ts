import { describe, it, expect } from 'vitest';
import { KernelLadder, createKernelLadder } from '../adapters/kernel-ladder.adapter.js';
import type { GovernanceConfig } from '../config.js';
import type { KernelRequest } from '../types.js';
import { fakeKernel, throwingKernel } from './_fakes.js';

const req: KernelRequest = { actorId: 'u1', action: 'file.write', target: { path: '/repo/a.ts' } };

describe('KernelLadder — degrade priority napi → daemon → ts → synthetic', () => {
  it('uses the highest rung when it answers', async () => {
    const napi = fakeKernel({
      verdict: { effect: 'allow', tier: 'low', reason: 'napi', degraded: false, engine: 'napi' },
      status: { engine: 'napi', status: 'up', degraded: false },
    });
    const ts = fakeKernel({ verdict: { effect: 'deny', tier: 'high', reason: 'ts', degraded: true, engine: 'ts' } });
    const ladder = new KernelLadder([napi, ts]);

    const v = await ladder.decide(req);
    expect(v.engine).toBe('napi');
    expect(v.effect).toBe('allow');
  });

  it('falls through a faulting rung to the next (down to the ts floor)', async () => {
    const napi = throwingKernel({ engine: 'napi', status: 'up', degraded: false });
    const ts = fakeKernel({ verdict: { effect: 'deny', tier: 'high', reason: 'ts floor', degraded: true, engine: 'ts' } });
    const ladder = new KernelLadder([napi, ts]);

    const v = await ladder.decide(req);
    expect(v.engine).toBe('ts');
    expect(v.effect).toBe('deny');
  });

  it('FAIL-CLOSED: every rung faulting yields a synthetic DENY (never an allow)', async () => {
    const ladder = new KernelLadder([throwingKernel(), throwingKernel()]);
    const v = await ladder.decide(req);

    expect(v.effect).toBe('deny');
    expect(v.engine).toBe('synthetic');
    expect(v.degraded).toBe(true);
    expect(v.tier).toBe('critical');
  });

  it('enforceTool fails closed to a synthetic denial when all rungs fault', async () => {
    const ladder = new KernelLadder([throwingKernel()]);
    const t = await ladder.enforceTool('rm', 'rm -rf /', req);
    expect(t.outcome).toBe('denied');
    expect(t.engine).toBe('synthetic');
    expect(t.degraded).toBe(true);
  });

  it('route is unroutable/critical when all rungs fault', async () => {
    const ladder = new KernelLadder([throwingKernel()]);
    const r = await ladder.route(req);
    expect(r.routable).toBe(false);
    expect(r.tier).toBe('critical');
  });

  it('status() reports the top rung truthfully', async () => {
    const napi = fakeKernel({ status: { engine: 'napi', status: 'up', degraded: false } });
    expect(new KernelLadder([napi]).status().engine).toBe('napi');
  });

  it('status() is a synthetic down when the ladder is empty (never a faked up)', async () => {
    const s = new KernelLadder([]).status();
    expect(s.engine).toBe('synthetic');
    expect(s.status).toBe('down');
    expect(s.degraded).toBe(true);
  });
});

describe('createKernelLadder — real assembly falls to the pure-TS floor', () => {
  const cfg: GovernanceConfig = {
    internalServiceKeyPresent: false,
    napiEnabled: false, // skip the native rung
    // Point at a socket that cannot answer so the daemon rung probes unhealthy
    // and the ladder deterministically degrades to the pure-TS floor (a real
    // governance daemon may otherwise be spawnable in some environments).
    daemonSocketPath: '/tmp/recoder-governance-nonexistent-test.sock',
    allowInsecureDaemon: true,
    vaultMasterKey: null,
    auditEnabled: true,
    isProduction: false,
  };

  it('reports the active rung as the deny-biased ts kernel (truthful, degraded)', async () => {
    const ladder = await createKernelLadder(cfg);
    const status = ladder.status();
    expect(status.engine).toBe('ts');
    expect(status.degraded).toBe(true);
  });

  it('the real ts floor answers decide() with a stamped ts verdict (never throws)', async () => {
    const ladder = await createKernelLadder(cfg);
    const v = await ladder.decide(req);
    expect(v.engine).toBe('ts');
    expect(['allow', 'deny', 'needs_approval']).toContain(v.effect);
  });
});
