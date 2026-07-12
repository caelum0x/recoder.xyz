/**
 * billing-engine — reads the owner's authoritative plan + usage headroom over a
 * faked DistributionModule. No live Polar / recoder.xyz / conductor needed; the
 * subject-resolution order (args.userId → task owner → workspace.createdBy) and
 * the truthful "no subject" failure are covered.
 */
import { describe, expect, it, vi } from 'vitest';
import { McpRegistry, McpToolRouter, billingMcpServer } from '@recoder/agent-mcp';
import type { AgentProfile, TaskSpec } from '@recoder/agent-os';
import type { Entitlement, QuotaDecision, RecoderUserProfile } from '@recoder/distribution';
import {
  registerBillingMcpTools,
  type BillingEngineDeps,
  type BillingModuleLike,
  type BillingWorkspaceLike,
} from './billing-engine';

const actor = { agentId: 'agent_b', permissions: { toolRules: [] } } as unknown as AgentProfile;

function profile(userId: string, plan: RecoderUserProfile['plan']): RecoderUserProfile {
  return { userId, email: `${userId}@x`, name: userId, plan, hasOwnApiKey: false };
}

function grant(subjectId: string, plan: Entitlement['plan']): Entitlement {
  return { subjectId, kind: 'plan', key: 'plan', plan, granted: true };
}

function quotaDecision(remaining: number, limit: number): QuotaDecision {
  return {
    allowed: limit === 0 || remaining > 0,
    quota: { subjectId: 'u', kind: 'agent_run', limit, remaining, resetAt: '2026-01-01T00:00:00Z' },
    ...(limit !== 0 && remaining <= 0 ? { reason: 'quota exceeded' } : {}),
  };
}

function setup(
  moduleOverrides: Partial<BillingModuleLike> = {},
  workspaces: BillingWorkspaceLike[] = [],
) {
  const getUserProfile = vi.fn(async (userId: string) => profile(userId, 'pro'));
  const resolve = vi.fn(async () => [grant('u', 'pro')]);
  const checkQuota = vi.fn(async () => quotaDecision(9, 100));
  const module: BillingModuleLike = {
    auth: { getUserProfile },
    resolver: { resolve },
    billing: { checkQuota },
    ...moduleOverrides,
  };
  const router = new McpToolRouter(new McpRegistry());
  const deps: BillingEngineDeps = {
    getModule: () => module,
    getWorkspace: async (id) => workspaces.find((w) => w.workspaceId === id) ?? null,
    listWorkspaces: async () => workspaces,
  };
  registerBillingMcpTools(router, deps);
  return { router, getUserProfile, resolve, checkQuota };
}

const call = (
  router: McpToolRouter,
  toolName: string,
  args: Record<string, unknown>,
  task?: Partial<TaskSpec>,
) => router.call({ server: billingMcpServer, toolName, actor, args, task } as never);

describe('billing engine', () => {
  it('billing.plan.read returns the authoritative plan + entitlements for args.userId', async () => {
    const { router, getUserProfile } = setup();
    const out = await call(router, 'billing.plan.read', { userId: 'user_42' });
    expect(getUserProfile).toHaveBeenCalledWith('user_42');
    const c = out.content as { userId: string; plan: string; entitlements: unknown[] };
    expect(c.userId).toBe('user_42');
    expect(c.plan).toBe('pro');
    expect(c.entitlements).toHaveLength(1);
  });

  it('billing.plan.read resolves the owner from the task metadata when no userId arg', async () => {
    const { router, getUserProfile } = setup();
    await call(router, 'billing.plan.read', {}, { taskId: 't1', metadata: { userId: 'owner_from_task' } });
    expect(getUserProfile).toHaveBeenCalledWith('owner_from_task');
  });

  it('billing.plan.read falls back to the workspace createdBy owner', async () => {
    const { router, getUserProfile } = setup({}, [
      { workspaceId: 'ws1', taskId: 't1', createdBy: 'owner_from_ws' },
    ]);
    await call(router, 'billing.plan.read', { workspaceId: 'ws1' });
    expect(getUserProfile).toHaveBeenCalledWith('owner_from_ws');
  });

  it('billing.plan.read reports a truthful message (no fake plan) when the profile is unknown', async () => {
    const { router } = setup({ auth: { getUserProfile: vi.fn(async () => null) } });
    const out = await call(router, 'billing.plan.read', { userId: 'ghost' });
    const c = out.content as { plan: string | null; message: string };
    expect(c.plan).toBeNull();
    expect(c.message).toMatch(/no plan profile/i);
  });

  it('billing.usage.read reports quota headroom for the metered kind', async () => {
    const { router, checkQuota } = setup();
    const out = await call(router, 'billing.usage.read', { userId: 'user_42', kind: 'agent_run' });
    expect(checkQuota).toHaveBeenCalledWith({ subjectId: 'user_42', kind: 'user' }, 'agent_run');
    const c = out.content as { allowed: boolean; limit: number; remaining: number };
    expect(c.allowed).toBe(true);
    expect(c.limit).toBe(100);
    expect(c.remaining).toBe(9);
  });

  it('billing.usage.read rejects an unknown usage kind (truthful error)', async () => {
    const { router } = setup();
    await expect(call(router, 'billing.usage.read', { userId: 'u', kind: 'bogus' })).rejects.toThrow(/unknown usage kind/i);
  });

  it('surfaces a truthful error when no billing subject can be resolved', async () => {
    const { router } = setup();
    await expect(call(router, 'billing.plan.read', {})).rejects.toThrow(/no billing subject/i);
  });
});
