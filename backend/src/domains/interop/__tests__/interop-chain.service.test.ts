import { describe, it, expect } from 'vitest';
import { InteropChainService } from '../gate/interop-chain.service.js';
import type { InteropContext } from '../../governance/ports/interop.port.js';
import type { GateTarget } from '../../governance/types.js';
import {
  fakeGate,
  principal,
  anonymousPrincipal,
  ALLOW_VERDICT,
  DENY_VERDICT,
  silentLogger,
} from './_fakes.js';

const target: GateTarget = { path: '/repo/a.ts' };

function ctx(overrides: Partial<InteropContext> = {}): InteropContext {
  return { principal: principal(), action: 'file.write', target, isWrite: true, ...overrides };
}

describe('InteropChainService — authorize → risk → policy → audit (fail-closed)', () => {
  it('ADMITS a write when the gate allows', async () => {
    const chain = new InteropChainService({ gate: fakeGate({ verdict: ALLOW_VERDICT }), logger: silentLogger });
    const d = await chain.run(ctx());
    expect(d.admit).toBe(true);
    expect(d.effect).toBe('allow');
    expect(d.auditHash).toBe(ALLOW_VERDICT.auditHash);
  });

  it('FAIL-CLOSED: denies a write when the gate denies', async () => {
    const chain = new InteropChainService({ gate: fakeGate({ verdict: DENY_VERDICT }), logger: silentLogger });
    const d = await chain.run(ctx());
    expect(d.admit).toBe(false);
    expect(d.effect).toBe('deny');
    expect(d.rejectedAt).toBe('policy');
  });

  it('FAIL-CLOSED: denies a write when the gate throws (never admits on fault)', async () => {
    const chain = new InteropChainService({ gate: fakeGate({ throwOnDecide: true }), logger: silentLogger });
    const d = await chain.run(ctx());
    expect(d.admit).toBe(false);
    expect(d.effect).toBe('deny');
    expect(d.degraded).toBe(true);
  });

  it('FAIL-CLOSED: denies every edge when no gate is wired', async () => {
    const chain = new InteropChainService({ logger: silentLogger });
    const write = await chain.run(ctx());
    expect(write.admit).toBe(false);
    const read = await chain.run(ctx({ isWrite: false }));
    expect(read.admit).toBe(false);
    expect(read.degraded).toBe(true); // unwired gate is a degraded posture
  });

  it('rejects an unauthenticated edge at the authorize stage', async () => {
    const chain = new InteropChainService({ gate: fakeGate({ verdict: ALLOW_VERDICT }), logger: silentLogger });
    const d = await chain.run(ctx({ principal: null }));
    expect(d.admit).toBe(false);
    expect(d.rejectedAt).toBe('authorize');
  });

  it('lets an anonymous principal READ but never WRITE', async () => {
    const chain = new InteropChainService({ gate: fakeGate({ verdict: ALLOW_VERDICT }), logger: silentLogger });

    const write = await chain.run(ctx({ principal: anonymousPrincipal(), isWrite: true }));
    expect(write.admit).toBe(false);
    expect(write.rejectedAt).toBe('authorize');

    const read = await chain.run(ctx({ principal: anonymousPrincipal(), isWrite: false }));
    expect(read.admit).toBe(true); // route() allowed
  });

  it('READ edge admits when routing is routable (no durable seal)', async () => {
    const chain = new InteropChainService({
      gate: fakeGate({ routing: { routable: true, tier: 'low', reason: 'ok' } }),
      logger: silentLogger,
    });
    const d = await chain.run(ctx({ isWrite: false }));
    expect(d.admit).toBe(true);
    expect(d.effect).toBe('allow');
    expect(d.auditHash).toBeUndefined();
  });

  it('READ edge denies when routing is unroutable', async () => {
    const chain = new InteropChainService({
      gate: fakeGate({ routing: { routable: false, tier: 'critical', reason: 'unroutable' } }),
      logger: silentLogger,
    });
    const d = await chain.run(ctx({ isWrite: false }));
    expect(d.admit).toBe(false);
    expect(d.effect).toBe('deny');
    expect(d.rejectedAt).toBe('policy');
  });

  it('FAIL-CLOSED: a read denies when the gate route() throws', async () => {
    const chain = new InteropChainService({ gate: fakeGate({ throwOnRoute: true }), logger: silentLogger });
    const d = await chain.run(ctx({ isWrite: false }));
    expect(d.admit).toBe(false);
  });
});
