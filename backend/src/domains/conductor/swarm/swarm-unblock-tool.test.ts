/**
 * `recoder_swarm_unblock` MCP tool -- proves the GOVERNED, owner-scoped binding
 * (mirrors the wait tool): an authenticated owner may unblock; an unowned workspace
 * is refused (403, no oracle); an unknown workspace is a truthful miss; the
 * workspace's durable policy owns auto-answer posture; and the
 * {@link SwarmUnblockResult} flows straight back from the surface.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import type { McpToolCaller } from '../../../shared/module-base.js';
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type {
  ResolveBlockedInput,
  SwarmUnblockResult,
} from './swarm-unblock.service.js';
import {
  buildConductorSwarmUnblockTools,
  type ConductorSwarmUnblockSurface,
} from './swarm-unblock-tool.js';

const OWNER: McpToolCaller = {
  userId: 'user-1',
  orgId: 'org-1',
  scopes: ['read', 'write'],
};

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-1',
    createdBy: 'user-1',
    tenant: { orgId: 'org-1' },
    ...overrides,
  } as unknown as Workspace;
}

class FakeSurface implements ConductorSwarmUnblockSurface {
  readonly resolves: ResolveBlockedInput[] = [];
  constructor(
    private readonly ws: Workspace | null,
    private readonly result: SwarmUnblockResult = {
      action: 'escalated',
      requestId: 'appr_1',
      question: 'q?',
      reason: 'escalate by default',
    }
  ) {}
  async getWorkspace(): Promise<Workspace | null> {
    return this.ws;
  }
  async resolveSwarmUnblock(
    input: ResolveBlockedInput
  ): Promise<SwarmUnblockResult> {
    this.resolves.push(input);
    return this.result;
  }
}

function tool(surface: ConductorSwarmUnblockSurface) {
  const [reg] = buildConductorSwarmUnblockTools(surface);
  expect(reg.name).toBe('recoder_swarm_unblock');
  return reg;
}

describe('recoder_swarm_unblock tool', () => {
  it('escalates by default (autoAnswer defaults to false) for the owning caller', async () => {
    const surface = new FakeSurface(workspace());
    const reg = tool(surface);
    const out = (await reg.handler(
      { workspaceId: 'ws-1', taskGroup: 'fan-1' },
      OWNER
    )) as SwarmUnblockResult;
    expect(out.action).toBe('escalated');
    expect(surface.resolves).toHaveLength(1);
    const passed = surface.resolves[0];
    expect(passed.workspaceId).toBe('ws-1');
    expect(passed.taskGroup).toBe('fan-1');
    expect(passed.policy.autoAnswer).toBe(false);
    expect(passed.actor.userId).toBe('user-1');
  });

  it('takes auto-answer from the durable workspace profile, not request args', async () => {
    const surface = new FakeSurface(workspace({
      policyProfile: {
        version: 1,
        revision: 3,
        defaultToolEffect: 'allow',
        toolRules: [],
        swarm: { autoAnswer: true, minConfidence: 0.9 },
      },
    }), {
      action: 'answered',
      answer: 'a',
      source: 'memory',
      question: 'q?',
    });
    const reg = tool(surface);
    const out = (await reg.handler(
      { workspaceId: 'ws-1', autoAnswer: false },
      OWNER
    )) as SwarmUnblockResult;
    expect(out.action).toBe('answered');
    expect(surface.resolves[0].policy.autoAnswer).toBe(true);
    expect(surface.resolves[0].policy.minConfidence).toBe(0.9);
  });

  it('refuses (403) when a non-privileged caller does not own the workspace', async () => {
    const surface = new FakeSurface(
      workspace({ createdBy: 'someone-else', tenant: { orgId: 'org-2' } })
    );
    const reg = tool(surface);
    await expect(
      reg.handler({ workspaceId: 'ws-1' }, OWNER)
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    expect(surface.resolves).toHaveLength(0);
  });

  it('an admin caller may unblock across tenants', async () => {
    const surface = new FakeSurface(
      workspace({ createdBy: 'someone-else', tenant: { orgId: 'org-2' } })
    );
    const reg = tool(surface);
    const admin: McpToolCaller = { userId: 'root', scopes: ['admin'] };
    const out = (await reg.handler(
      { workspaceId: 'ws-1' },
      admin
    )) as SwarmUnblockResult;
    expect(out.action).toBe('escalated');
    expect(surface.resolves).toHaveLength(1);
  });

  it('an unknown workspace resolves a truthful miss (never an oracle)', async () => {
    const surface = new FakeSurface(null);
    const reg = tool(surface);
    const out = (await reg.handler({ workspaceId: 'ws-x' }, OWNER)) as {
      workspace: null;
    };
    expect(out).toEqual({ workspace: null });
    expect(surface.resolves).toHaveLength(0);
  });

  it('refuses without an authenticated caller identity', async () => {
    const surface = new FakeSurface(workspace());
    const reg = tool(surface);
    await expect(
      reg.handler({ workspaceId: 'ws-1' }, undefined)
    ).rejects.toBeInstanceOf(AppError);
  });

  it('requires a workspaceId', async () => {
    const surface = new FakeSurface(workspace());
    const reg = tool(surface);
    const out = (await reg.handler({}, OWNER)) as { error: string };
    expect(out.error).toContain('workspaceId');
  });
});
