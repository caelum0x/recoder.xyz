/**
 * Proves the per-tool governance TEETH fire on the sidecar tool-exec path: a
 * forbidden tool call is denied BEFORE the wrapped engine runs (inner never
 * touched), an allowed call passes through, and the enforcer sees a secret-free
 * input projection. Uses a fake inner `EngineClientPort` + a fake enforcer — no
 * kernel, no real sidecar.
 */
import { describe, it, expect } from 'vitest';
import {
  governSidecar,
  GovernedSidecarAdapter,
  bindSidecarEnforcement,
  type SidecarEnforcement,
} from './governed-sidecar.adapter.js';
import type { EngineCall, EngineClientPort } from '../../ports/engine-client.port.js';
import { ok, up, type EngineHealth, type InvokeResult } from '../../types.js';
import type { GovernanceGate } from '../../../governance/ports/gate.port.js';
import type { Principal } from '../../../identity/types.js';
import type { ToolEnforcement } from '../../../governance/types.js';

/** A fake inner sidecar adapter that records every invoke it receives. */
function fakeInner(): EngineClientPort<unknown, unknown> & { calls: EngineCall<unknown>[]; started: number } {
  const calls: EngineCall<unknown>[] = [];
  return {
    id: 'browser-use',
    transport: 'sidecar',
    calls,
    started: 0,
    async start() {
      this.started += 1;
    },
    async stop() {},
    async invoke(call: EngineCall<unknown>): Promise<InvokeResult<unknown>> {
      calls.push(call);
      return ok({ ran: true });
    },
    async health(): Promise<EngineHealth> {
      return up('browser-use', 'sidecar');
    },
  };
}

function principal(): Principal {
  return { userId: 'agent-1', scopes: ['write'], kind: 'internal', isAnonymous: false, raw: null };
}

describe('GovernedSidecarAdapter — per-tool teeth on the sidecar exec path', () => {
  it('DENIES a forbidden tool call before the inner engine runs', async () => {
    const inner = fakeInner();
    const enforce = async (): Promise<SidecarEnforcement> => ({ outcome: 'denied', reason: 'forbidden path' });
    const governed = governSidecar(inner, enforce);

    const res = await governed.invoke({ op: 'navigate', input: { url: 'file:///etc/shadow' } });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('GOVERNANCE_DENIED');
      expect(res.reason).toContain('browser-use.navigate');
    }
    // The wrapped engine was NEVER invoked — the teeth bit first.
    expect(inner.calls).toHaveLength(0);
  });

  it('ALLOWS a permitted tool call through to the inner engine', async () => {
    const inner = fakeInner();
    const enforce = async (): Promise<SidecarEnforcement> => ({ outcome: 'allowed', reason: 'ok' });
    const governed = governSidecar(inner, enforce);

    const res = await governed.invoke({ op: 'navigate', input: { url: 'https://example.com' } });
    expect(res.ok).toBe(true);
    expect(inner.calls).toHaveLength(1);
    expect(inner.calls[0]?.op).toBe('navigate');
  });

  it('hands the enforcer a secret-free input projection (never leaks a token)', async () => {
    const inner = fakeInner();
    const seen: { toolName: string; input: string }[] = [];
    const enforce = async (toolName: string, input: string): Promise<SidecarEnforcement> => {
      seen.push({ toolName, input });
      return { outcome: 'allowed', reason: 'ok' };
    };
    const governed = new GovernedSidecarAdapter(inner, enforce);

    await governed.invoke({ op: 'extract', input: { url: 'https://x.dev', apiKey: 'sk_secret', authToken: 't0ken' } });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.toolName).toBe('browser-use.extract');
    expect(seen[0]?.input).toContain('https://x.dev');
    expect(seen[0]?.input).not.toContain('sk_secret');
    expect(seen[0]?.input).not.toContain('t0ken');
  });

  it('governSidecar with no enforcer returns the inner adapter unchanged (truthful pass-through)', () => {
    const inner = fakeInner();
    expect(governSidecar(inner, undefined)).toBe(inner);
  });

  it('delegates start/stop/health to the inner adapter', async () => {
    const inner = fakeInner();
    const governed = governSidecar(inner, async () => ({ outcome: 'allowed', reason: 'ok' }));
    await governed.start();
    expect(inner.started).toBe(1);
    expect((await governed.health()).status).toBe('up');
  });

  it('bindSidecarEnforcement drives the real governance gate.enforceTool seam', async () => {
    const calls: { toolName: string; input: string; toolNameInCtx?: string }[] = [];
    const gate = {
      async enforceTool(toolName: string, input: string, _p: Principal, ctx): Promise<ToolEnforcement> {
        calls.push({ toolName, input, toolNameInCtx: ctx?.target.toolName });
        return { outcome: 'denied', reason: 'blocked', degraded: false, engine: 'ts' };
      },
    } as unknown as GovernanceGate;

    const enforce = bindSidecarEnforcement(gate, principal(), { target: { path: '/repo' }, taskId: 't1' });
    const inner = fakeInner();
    const governed = governSidecar(inner, enforce);

    const res = await governed.invoke({ op: 'screenshot', input: { url: 'https://x.dev' } });
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.toolName).toBe('browser-use.screenshot');
    // The tool name is threaded into the decision context target for the audit row.
    expect(calls[0]?.toolNameInCtx).toBe('browser-use.screenshot');
    expect(inner.calls).toHaveLength(0);
  });
});
