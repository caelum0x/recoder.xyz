/**
 * `recoder_converge_refan` MCP tool — proves the GOVERNED, owner-scoped binding
 * (mirrors the swarm-unblock tool): an authenticated owner may re-fan; an unowned
 * group is refused (403, no oracle); an unknown/never-converged group is a truthful
 * refusal (no fabricated base); the identity is the HOST caller (never `args.userId`);
 * `agentKinds` is validated; and the {@link ReFanResult} flows straight back.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import type { McpToolCaller } from '../../../shared/module-base.js';
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { ReFanInput, ReFanResult } from '../fanout/re-fan.service.js';
import {
  buildConductorReFanTools,
  type ConductorReFanSurface,
} from './conductor-refan-tool.js';

const OWNER: McpToolCaller = {
  userId: 'user-1',
  orgId: 'org-1',
  scopes: ['read', 'write'],
};

const OK_RESULT: ReFanResult = {
  refused: false,
  priorTaskGroup: 'fan-round1',
  priorConverge: {
    workspaceId: 'ws_r1',
    branch: 'recoder/converge-abcd1234',
  },
  provenanceLink: null,
  taskGroup: 'fan-round2',
  workspaceIds: ['ws_claude', 'ws_codex'],
  converged: { workspaceId: 'ws_r2', branch: 'recoder/converge-r2' },
  perAgent: [],
};

function priorWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_r1',
    branch: 'recoder/converge-abcd1234',
    createdBy: 'user-1',
    tenant: { orgId: 'org-1' },
    metadata: { convergedFromTaskGroup: 'fan-round1' },
    ...overrides,
  } as unknown as Workspace;
}

class FakeSurface implements ConductorReFanSurface {
  readonly reFans: ReFanInput[] = [];
  constructor(
    private readonly prior: Workspace | null,
    private readonly result: ReFanResult = OK_RESULT
  ) {}
  async resolvePriorConvergence(): Promise<Workspace | null> {
    return this.prior;
  }
  async reFan(input: ReFanInput): Promise<ReFanResult> {
    this.reFans.push(input);
    return this.result;
  }
}

function tool(surface: ConductorReFanSurface) {
  const [reg] = buildConductorReFanTools(surface);
  expect(reg.name).toBe('recoder_converge_refan');
  return reg;
}

const ARGS = {
  taskGroup: 'fan-round1',
  narrowedTask: 'add rate limiting',
  agentKinds: ['claude', 'codex'],
  repoPath: '/repo',
  spaceId: 'space-1',
  projectId: 'proj-1',
};

describe('recoder_converge_refan tool', () => {
  it('re-fans for the owning caller, binding identity to the HOST caller (never args.userId)', async () => {
    const surface = new FakeSurface(priorWorkspace());
    const reg = tool(surface);
    const out = (await reg.handler(
      { ...ARGS, userId: 'someone-else', memory: 'ctx', settleTimeoutMs: 1234 },
      OWNER
    )) as ReFanResult;

    expect(out.refused).toBe(false);
    expect(surface.reFans).toHaveLength(1);
    const passed = surface.reFans[0];
    expect(passed.taskGroup).toBe('fan-round1');
    expect(passed.narrowedTask).toBe('add rate limiting');
    expect(passed.agentKinds).toEqual(['claude', 'codex']);
    expect(passed.repoPath).toBe('/repo');
    expect(passed.memory).toBe('ctx');
    expect(passed.settleTimeoutMs).toBe(1234);
    // Identity is the HOST caller — a forged args.userId is ignored.
    expect(passed.actor.userId).toBe('user-1');
  });

  it('refuses (403) when a non-privileged caller does not own the group', async () => {
    const surface = new FakeSurface(
      priorWorkspace({ createdBy: 'someone-else', tenant: { orgId: 'org-2' } })
    );
    const reg = tool(surface);
    await expect(reg.handler(ARGS, OWNER)).rejects.toMatchObject({
      code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
    });
    expect(surface.reFans).toHaveLength(0);
  });

  it('lets an admin caller re-fan across tenants', async () => {
    const surface = new FakeSurface(
      priorWorkspace({ createdBy: 'someone-else', tenant: { orgId: 'org-2' } })
    );
    const reg = tool(surface);
    const admin: McpToolCaller = { userId: 'root', scopes: ['admin'] };
    const out = (await reg.handler(ARGS, admin)) as ReFanResult;
    expect(out.refused).toBe(false);
    expect(surface.reFans).toHaveLength(1);
    expect(surface.reFans[0].actor.userId).toBe('root');
  });

  it('truthfully refuses an unknown/never-converged group (no fabricated base, reFan never called)', async () => {
    const surface = new FakeSurface(null);
    const reg = tool(surface);
    const out = (await reg.handler(ARGS, OWNER)) as ReFanResult;
    expect(out.refused).toBe(true);
    if (!out.refused) throw new Error('unreachable');
    expect(out.priorTaskGroup).toBe('fan-round1');
    expect(out.reason).toMatch(/no prior converged branch/i);
    expect(surface.reFans).toHaveLength(0);
  });

  it('refuses without an authenticated caller identity (SERVICE never invoked)', async () => {
    const surface = new FakeSurface(priorWorkspace());
    const reg = tool(surface);
    await expect(reg.handler(ARGS, undefined)).rejects.toBeInstanceOf(AppError);
    expect(surface.reFans).toHaveLength(0);
  });

  it('requires taskGroup and narrowedTask', async () => {
    const surface = new FakeSurface(priorWorkspace());
    const reg = tool(surface);
    const noGroup = (await reg.handler(
      { ...ARGS, taskGroup: '' },
      OWNER
    )) as { error: string };
    expect(noGroup.error).toContain('taskGroup');
    const noTask = (await reg.handler(
      { ...ARGS, narrowedTask: '  ' },
      OWNER
    )) as { error: string };
    expect(noTask.error).toContain('narrowedTask');
  });

  it('rejects an unknown agent kind and a set with <2 distinct kinds', async () => {
    const surface = new FakeSurface(priorWorkspace());
    const reg = tool(surface);
    const bad = (await reg.handler(
      { ...ARGS, agentKinds: ['claude', 'not_a_kind'] },
      OWNER
    )) as { error: string };
    expect(bad.error).toContain('unknown agent kind');
    const tooFew = (await reg.handler(
      { ...ARGS, agentKinds: ['claude', 'claude'] },
      OWNER
    )) as { error: string };
    expect(tooFew.error).toMatch(/≥2|distinct/i);
    expect(surface.reFans).toHaveLength(0);
  });
});
