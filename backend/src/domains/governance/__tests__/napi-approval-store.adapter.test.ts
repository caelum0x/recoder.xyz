/**
 * Contract tests for the kernel-backed approval store adapter. A FAKE native
 * handle stands in for `recoder-governance-napi`'s `NapiGovernanceKernel` so the
 * submit/resolve/list/count/findApproval/reload roundtrip is proven WITHOUT the
 * `.node` addon. The unavailable path (no handle) is proven degrade-truthful.
 */
import { describe, it, expect } from 'vitest';
import {
  createNapiApprovalStore,
  unavailableApprovalStore,
  hasApprovalStoreSurface,
  type NapiApprovalKernelHandle,
} from '../adapters/napi-approval-store.adapter.js';
import type { ApprovalSubmitInput } from '../ports/approval-store.port.js';

/** An in-memory fake of the native `NapiGovernanceKernel` approval surface. */
function fakeHandle(overrides: Partial<NapiApprovalKernelHandle> = {}): NapiApprovalKernelHandle {
  const pending = new Map<string, { id: string; agent_id: string; tool_name: string; risk_level: string }>();
  const reloaded: string[] = [];
  const handle: NapiApprovalKernelHandle & { reloaded: string[] } = {
    reloaded,
    submitApproval(requestJson: string): string {
      const req = JSON.parse(requestJson) as {
        id: string;
        agent_id: string;
        tool_name: string;
        risk_level: string;
      };
      // Deny-biased kernel default: high/critical wait for a human (pending).
      pending.set(req.id, {
        id: req.id,
        agent_id: req.agent_id,
        tool_name: req.tool_name,
        risk_level: req.risk_level,
      });
      return JSON.stringify({ outcome: 'pending', request_id: req.id });
    },
    resolveApproval(requestId: string, decision: string): string {
      if (!pending.has(requestId)) throw new Error(`no pending approval '${requestId}'`);
      pending.delete(requestId);
      return JSON.stringify({ request_id: requestId, decision });
    },
    listPendingApprovals(): string {
      return JSON.stringify([...pending.values()]);
    },
    pendingApprovalCount(): number {
      return pending.size;
    },
    reloadPolicies(configJson: string): void {
      reloaded.push(configJson);
    },
    ...overrides,
  };
  return handle;
}

function submitInput(overrides: Partial<ApprovalSubmitInput> = {}): ApprovalSubmitInput {
  return {
    id: 'appr-1',
    agentId: 'agent-1',
    toolName: 'branch.push',
    description: 'push the feature branch',
    actionSummary: 'git push origin feat',
    riskLevel: 'high',
    timeoutSecs: 300,
    taskId: 't1',
    action: 'branch.push',
    ...overrides,
  };
}

describe('NapiApprovalStore (kernel-backed)', () => {
  it('reports available and roundtrips submit → count → listPending → resolve → findApproval', async () => {
    const store = createNapiApprovalStore(fakeHandle());
    expect(store.available).toBe(true);

    const submitted = await store.submit(submitInput());
    expect(submitted.outcome).toBe('pending');
    expect(submitted.stored).toBe(true);
    expect(submitted.requestId).toBe('appr-1');

    expect(await store.count()).toBe(1);
    const pending = await store.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe('appr-1');

    // Not yet cleared while pending.
    expect(await store.findApproval('t1', 'branch.push')).toBeNull();

    const resolved = await store.resolve('appr-1', 'approved', 'admin');
    expect(resolved.stored).toBe(true);
    expect(await store.count()).toBe(0);

    // After the grant the clearance query returns the granting request id.
    expect(await store.findApproval('t1', 'branch.push')).toEqual({ requestId: 'appr-1' });
  });

  it('does not clear a DENIED resolution', async () => {
    const store = createNapiApprovalStore(fakeHandle());
    await store.submit(submitInput());
    await store.resolve('appr-1', 'denied', 'admin');
    expect(await store.findApproval('t1', 'branch.push')).toBeNull();
  });

  it('hot-swaps policy via reloadPolicies', async () => {
    const handle = fakeHandle();
    const store = createNapiApprovalStore(handle);
    const res = await store.reloadPolicies('{"forbiddenPathGlobs":["**/.env"]}');
    expect(res.reloaded).toBe(true);
    expect((handle as unknown as { reloaded: string[] }).reloaded).toContain('{"forbiddenPathGlobs":["**/.env"]}');
  });

  it('degrades truthfully when the native submit throws (never a fake approval)', async () => {
    const store = createNapiApprovalStore(
      fakeHandle({
        submitApproval() {
          throw new Error('native boom');
        },
      }),
    );
    const res = await store.submit(submitInput());
    expect(res.stored).toBe(false);
    expect(res.outcome).toBe('denied');
    expect(res.reason).toContain('native boom');
  });

  it('reloadPolicies fails closed (old policy stays live) when the kernel rejects the config', async () => {
    const store = createNapiApprovalStore(
      fakeHandle({
        reloadPolicies() {
          throw new Error('invalid config');
        },
      }),
    );
    const res = await store.reloadPolicies('{bad}');
    expect(res.reloaded).toBe(false);
    expect(res.reason).toContain('invalid config');
  });
});

describe('unavailableApprovalStore (no native addon)', () => {
  it('is degrade-truthful: available false, ops never fabricate', async () => {
    const store = unavailableApprovalStore();
    expect(store.available).toBe(false);
    expect((await store.submit(submitInput())).stored).toBe(false);
    expect((await store.resolve('x', 'approved', 'admin')).stored).toBe(false);
    expect(await store.listPending()).toEqual([]);
    expect(await store.count()).toBe(0);
    expect(await store.findApproval('t1', 'branch.push')).toBeNull();
    expect((await store.reloadPolicies('{}')).reloaded).toBe(false);
  });

  it('createNapiApprovalStore falls back to unavailable when the handle lacks the surface', () => {
    expect(hasApprovalStoreSurface({})).toBe(false);
    const store = createNapiApprovalStore({ submitApproval: () => '{}' });
    expect(store.available).toBe(false);
  });
});
