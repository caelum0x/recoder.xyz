/**
 * `GovernanceNapiAdapter` contract:
 *  - it is a THIN re-expose of the injected `GovernanceKernelPort` (no `.node` load),
 *  - `health` maps the kernel rung truthfully: napi+non-degraded → up; daemon/ts → degraded; down → down,
 *  - `invoke` routes decide/enforceTool/route/status and is deny-biased on throw.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../../shared/logger.js';
import type { GovernanceKernelPort } from '../../../governance/ports/kernel.port.js';
import type {
  AuditVerification,
  KernelStatus,
  KernelVerdict,
  RoutingHint,
  ToolEnforcement,
} from '../../../governance/types.js';
import type { KernelRequest } from '../../../governance/types.js';
import { GovernanceNapiAdapter, buildDecisionExplanation } from './governance-napi.adapter.js';

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as Logger;

function fakeKernel(status: KernelStatus, overrides: Partial<GovernanceKernelPort> = {}): GovernanceKernelPort {
  const verdict: KernelVerdict = { effect: 'allow', tier: 'low', reason: 'ok', degraded: false, engine: status.engine };
  const enforcement: ToolEnforcement = { outcome: 'allowed', reason: 'ok', degraded: false, engine: status.engine };
  const routing: RoutingHint = { routable: true, tier: 'low', reason: 'ok' };
  const audit: AuditVerification = { ok: true, entries: 0, tipHash: 'a'.repeat(64) };
  return {
    decide: async () => verdict,
    enforceTool: async () => enforcement,
    route: async () => routing,
    auditTip: async () => 'a'.repeat(64),
    verifyAudit: async () => audit,
    status: () => status,
    ...overrides,
  };
}

describe('GovernanceNapiAdapter (thin re-expose)', () => {
  it('reports up only when the napi rung answers non-degraded', async () => {
    const adapter = new GovernanceNapiAdapter(fakeKernel({ engine: 'napi', status: 'up', degraded: false }), log);
    const health = await adapter.health();
    expect(health.status).toBe('up');
    expect(health.version).toBe('kernel:napi');
  });

  it('reports degraded when the ladder fell to the daemon/ts rung', async () => {
    const adapter = new GovernanceNapiAdapter(fakeKernel({ engine: 'ts', status: 'up', degraded: true }), log);
    const health = await adapter.health();
    expect(health.status).toBe('degraded');
    expect(health.reason).toMatch(/ts/);
  });

  it('reports down when the kernel is down', async () => {
    const adapter = new GovernanceNapiAdapter(
      fakeKernel({ engine: 'synthetic', status: 'down', degraded: true, reason: 'kernel unavailable' }),
      log,
    );
    const health = await adapter.health();
    expect(health.status).toBe('down');
    expect(health.reason).toBe('kernel unavailable');
  });

  it('routes decide / enforceTool / status through the kernel', async () => {
    const adapter = new GovernanceNapiAdapter(fakeKernel({ engine: 'napi', status: 'up', degraded: false }), log);

    const decide = await adapter.invoke({ op: 'decide', input: { actorId: 'u1', action: 'tool.call', target: {} } });
    expect(decide.ok).toBe(true);
    if (decide.ok) expect(decide.value).toMatchObject({ effect: 'allow' });

    const enforce = await adapter.invoke({ op: 'enforceTool', input: { toolName: 'shell', input: 'ls' } });
    expect(enforce.ok).toBe(true);

    const status = await adapter.invoke({ op: 'status', input: {} });
    expect(status.ok).toBe(true);
  });

  it('requires toolName for enforceTool', async () => {
    const adapter = new GovernanceNapiAdapter(fakeKernel({ engine: 'napi', status: 'up', degraded: false }), log);
    const result = await adapter.invoke({ op: 'enforceTool', input: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BAD_INPUT');
  });

  it('explain composes decide + route into a rich "why" explanation', async () => {
    const adapter = new GovernanceNapiAdapter(fakeKernel({ engine: 'napi', status: 'up', degraded: false }), log);
    const result = await adapter.invoke({
      op: 'explain',
      input: { actorId: 'u1', action: 'tool.call', target: { toolName: 'shell' } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        effect: 'allow',
        allowed: true,
        requiresApproval: false,
        tier: 'low',
        confidence: 'authoritative',
        routing: { routable: true, tier: 'low' },
      });
      const explanation = result.value as { factors: Array<{ factor: string }>; summary: string; nextSteps: string[] };
      expect(explanation.summary).toMatch(/^ALLOW/);
      expect(explanation.factors.map((f) => f.factor)).toEqual(
        expect.arrayContaining(['effect', 'risk_tier', 'confidence', 'routing']),
      );
      expect(explanation.nextSteps.length).toBeGreaterThan(0);
    }
  });

  it('explain keeps the decision truthful even when routing throws (degrades only routing)', async () => {
    const adapter = new GovernanceNapiAdapter(
      fakeKernel({ engine: 'napi', status: 'up', degraded: false }, {
        route: async () => { throw new Error('router down'); },
      }),
      log,
    );
    const result = await adapter.invoke({ op: 'explain', input: { actorId: 'u1', action: 'tool.call', target: {} } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const explanation = result.value as { effect: string; routing: { routable: boolean } };
      expect(explanation.effect).toBe('allow');
      expect(explanation.routing.routable).toBe(false);
    }
  });

  it('explain is deny-biased: a throwing decide yields {ok:false}, never a fabricated explanation', async () => {
    const adapter = new GovernanceNapiAdapter(
      fakeKernel({ engine: 'napi', status: 'up', degraded: false }, {
        decide: async () => { throw new Error('kernel exploded'); },
      }),
      log,
    );
    const result = await adapter.invoke({ op: 'explain', input: { actorId: 'u1', action: 'tool.call', target: {} } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('KERNEL_THREW');
  });

  it('buildDecisionExplanation surfaces the approval gate + deny-biased next steps for needs_approval', () => {
    const req: KernelRequest = { actorId: 'u1', action: 'deploy', target: { environment: 'prod' } };
    const explanation = buildDecisionExplanation(
      req,
      { effect: 'needs_approval', tier: 'critical', reason: 'prod deploy', degraded: false, engine: 'napi', approvalGateId: 'apr-1' },
      { routable: true, tier: 'critical', reason: 'gated' },
    );
    expect(explanation.requiresApproval).toBe(true);
    expect(explanation.approvalId).toBe('apr-1');
    expect(explanation.summary).toMatch(/^NEEDS APPROVAL/);
    expect(explanation.factors.map((f) => f.factor)).toContain('approval');
    expect(explanation.nextSteps.join(' ')).toMatch(/approval/i);
  });

  it('buildDecisionExplanation marks a non-napi verdict as degraded/deny-biased confidence', () => {
    const req: KernelRequest = { actorId: 'u1', action: 'file.write', target: { path: 'src/x.ts' } };
    const explanation = buildDecisionExplanation(
      req,
      { effect: 'deny', tier: 'high', reason: 'forbidden path', degraded: true, engine: 'ts' },
      { routable: false, tier: 'high', reason: 'unroutable' },
    );
    expect(explanation.allowed).toBe(false);
    expect(explanation.confidence).toBe('degraded');
    expect(explanation.summary).toMatch(/^DENY/);
    expect(explanation.nextSteps.join(' ')).toMatch(/Do not proceed/);
  });

  it('is deny-biased: a throwing kernel yields {ok:false}, never a fabricated allow', async () => {
    const adapter = new GovernanceNapiAdapter(
      fakeKernel({ engine: 'napi', status: 'up', degraded: false }, {
        decide: async () => { throw new Error('kernel exploded'); },
      }),
      log,
    );
    const result = await adapter.invoke({ op: 'decide', input: { actorId: 'u1', action: 'tool.call', target: {} } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('KERNEL_THREW');
  });
});
