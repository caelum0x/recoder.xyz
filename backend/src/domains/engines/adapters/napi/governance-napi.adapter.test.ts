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
import { GovernanceNapiAdapter } from './governance-napi.adapter.js';

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
