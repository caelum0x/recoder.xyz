/**
 * cloud-write-gate tests — the WRITE wrapper every cloud mutation edge passes.
 * Locks in the fail-closed / degrade-open contract:
 *   - no gate injected        ⇒ degrade-OPEN (auth-only write, warn logged, no audit)
 *   - gate says allow          ⇒ allowed, verdict threaded through
 *   - gate says deny/needs_approval ⇒ blocked with a truthful 403 AppError
 *   - gate THROWS              ⇒ fail-CLOSED with a 503 AUTHZ_SERVICE_ERROR
 * and recordCloudAudit best-effort semantics (no-op without gate+verdict; a
 * sealing fault never throws / never unwinds the already-durable write).
 */
import { describe, it, expect } from 'vitest';
import { guardCloudWrite, recordCloudAudit } from '../services/cloud-write-gate.js';
import { ErrorCode } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';
import type {
  CloudGovernanceGatePort,
  GateVerdict,
  GateDecisionContext,
  AuditEntryInput,
} from '../ports/governance-gate.port.js';

function capturingLogger() {
  const calls: { level: string; msg: string }[] = [];
  const logger = {
    error: (_o: unknown, msg?: string) => calls.push({ level: 'error', msg: msg ?? '' }),
    warn: (_o: unknown, msg?: string) => calls.push({ level: 'warn', msg: msg ?? '' }),
    info: () => {},
    debug: () => {},
    child: () => logger,
  } as unknown as Parameters<typeof guardCloudWrite>[4];
  return { logger, calls };
}

const principal: Principal = {
  userId: 'user_1',
  scopes: ['write'],
  kind: 'session',
  isAnonymous: false,
  raw: null,
};

const ctx: GateDecisionContext = { target: { toolName: 'cloud.sandbox.provision' } };

function verdict(over: Partial<GateVerdict> = {}): GateVerdict {
  return {
    verdictId: 'vd_1',
    requestId: 'rq_1',
    effect: 'allow',
    tier: 'medium',
    reason: 'ok',
    degraded: false,
    engine: 'napi',
    createdAt: '2026-07-15T00:00:00.000Z',
    ...over,
  };
}

/** A gate stub whose decide/recordAudit are overridable per test. */
function gateStub(over: Partial<CloudGovernanceGatePort> = {}): CloudGovernanceGatePort {
  return {
    decide: async () => verdict(),
    recordAudit: async () => ({}) as Awaited<ReturnType<CloudGovernanceGatePort['recordAudit']>>,
    ...over,
  } as CloudGovernanceGatePort;
}

describe('guardCloudWrite — degrade-open (no gate injected)', () => {
  it('allows the write auth-only and logs a warn (documented degrade)', async () => {
    const { logger, calls } = capturingLogger();
    const r = await guardCloudWrite(undefined, 'cloud.sandbox.provision', principal, ctx, logger);
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.verdict).toBeUndefined();
    expect(calls.some((c) => c.level === 'warn' && c.msg.includes('without a governance gate'))).toBe(true);
  });
});

describe('guardCloudWrite — gate present (policy authoritative)', () => {
  it('allows and threads the verdict when the gate says allow', async () => {
    const { logger } = capturingLogger();
    const v = verdict({ effect: 'allow', verdictId: 'vd_allow' });
    const r = await guardCloudWrite(gateStub({ decide: async () => v }), 'cloud.preview.deploy', principal, ctx, logger);
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.verdict).toBe(v);
  });

  it('BLOCKS with a 403 AUTHZ_PROJECT_ACCESS_DENIED when the gate denies', async () => {
    const { logger } = capturingLogger();
    const v = verdict({ effect: 'deny', reason: 'tier exceeds tenant tier', tier: 'high' });
    const r = await guardCloudWrite(gateStub({ decide: async () => v }), 'cloud.sandbox.provision', principal, ctx, logger);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED);
      expect(r.error.statusCode).toBe(403);
      expect(r.error.message).toContain('deny');
      expect(r.error.details).toMatchObject({ effect: 'deny', tier: 'high' });
    }
  });

  it('BLOCKS on needs_approval and surfaces the approvalId in details', async () => {
    const { logger } = capturingLogger();
    const v = verdict({ effect: 'needs_approval', reason: 'requires human approval', approvalId: 'apr_42' });
    const r = await guardCloudWrite(gateStub({ decide: async () => v }), 'cloud.preview.deploy', principal, ctx, logger);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED);
      expect(r.error.details).toMatchObject({ effect: 'needs_approval', approvalId: 'apr_42' });
    }
  });

  it('does NOT include approvalId in details when the verdict has none', async () => {
    const { logger } = capturingLogger();
    const v = verdict({ effect: 'deny', reason: 'nope' });
    const r = await guardCloudWrite(gateStub({ decide: async () => v }), 'cloud.sandbox.provision', principal, ctx, logger);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.error.details).not.toHaveProperty('approvalId');
  });
});

describe('guardCloudWrite — fail-closed when the gate throws', () => {
  it('refuses the write with a 503 AUTHZ_SERVICE_ERROR (never a fake allow) and never throws', async () => {
    const { logger, calls } = capturingLogger();
    const gate = gateStub({
      decide: async () => {
        throw new Error('napi bridge panicked');
      },
    });
    const r = await guardCloudWrite(gate, 'cloud.sandbox.provision', principal, ctx, logger);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe(ErrorCode.AUTHZ_SERVICE_ERROR);
      expect(r.error.statusCode).toBe(503);
      expect(r.error.message).toContain('fail-closed');
    }
    expect(calls.some((c) => c.level === 'error' && c.msg.includes('failing closed'))).toBe(true);
  });
});

describe('recordCloudAudit — best-effort seal AFTER the write', () => {
  it('is a no-op when no gate is injected (degrade-open path has no chain)', async () => {
    const { logger } = capturingLogger();
    // No gate ⇒ must not throw and must do nothing observable.
    await expect(
      recordCloudAudit(undefined, 'cloud.sandbox.provision', principal, verdict(), {}, logger),
    ).resolves.toBeUndefined();
  });

  it('is a no-op when there is no verdict', async () => {
    const { logger } = capturingLogger();
    let called = false;
    const gate = gateStub({
      recordAudit: async () => {
        called = true;
        return {} as Awaited<ReturnType<CloudGovernanceGatePort['recordAudit']>>;
      },
    });
    await recordCloudAudit(gate, 'cloud.sandbox.provision', principal, undefined, {}, logger);
    expect(called).toBe(false);
  });

  it('seals a sanitized entry mapping actor/action/effect/tier/degraded/payload', async () => {
    const { logger } = capturingLogger();
    let seen: AuditEntryInput | undefined;
    const gate = gateStub({
      recordAudit: async (entry) => {
        seen = entry;
        return {} as Awaited<ReturnType<CloudGovernanceGatePort['recordAudit']>>;
      },
    });
    const v = verdict({ effect: 'allow', tier: 'medium', degraded: true });
    await recordCloudAudit(gate, 'cloud.preview.deploy', principal, v, { sandboxId: 'sb_1' }, logger);
    expect(seen).toEqual({
      actorId: 'user_1',
      action: 'cloud.preview.deploy',
      resource: 'cloud',
      effect: 'allow',
      riskTier: 'medium',
      degraded: true,
      payload: { sandboxId: 'sb_1' },
    });
  });

  it('swallows a sealing fault (write already durable) — never throws, logs a warn', async () => {
    const { logger, calls } = capturingLogger();
    const gate = gateStub({
      recordAudit: async () => {
        throw new Error('audit chain unreachable');
      },
    });
    await expect(
      recordCloudAudit(gate, 'cloud.sandbox.provision', principal, verdict(), {}, logger),
    ).resolves.toBeUndefined();
    expect(calls.some((c) => c.level === 'warn' && c.msg.includes('audit seal failed'))).toBe(true);
  });
});
