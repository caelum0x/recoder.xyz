/**
 * `recoder_playbook_list` + `recoder_playbook_run` MCP tools — prove the read-only
 * catalog and the GOVERNED, owner-scoped run binding (mirrors recoder_converge_fanout):
 *  - list returns the built-in ids + descriptions + step kinds;
 *  - run derives the acting identity from the HOST caller (never args.userId), validates
 *    playbookId + agentKinds, threads the resolved principal, and flows the truthful
 *    {@link PlaybookRunResult} straight back;
 *  - a non-privileged caller may NOT name another subject; an admin may;
 *  - absent a caller the tool refuses;
 *  - a `SERVICE_UNAVAILABLE` from the unwired run seam propagates truthfully.
 */
import { describe, it, expect } from 'vitest';
import type { McpToolCaller } from '../../../shared/module-base.js';
import { AppError, ErrorCode, createError } from '../../../shared/errors.js';
import type {
  PlaybookRunInput,
  PlaybookRunResult,
} from '../playbook/playbook.types.js';
import {
  buildConductorPlaybookTools,
  type ConductorPlaybookSurface,
} from './conductor-playbook-tool.js';

const OWNER: McpToolCaller = {
  userId: 'user-1',
  orgId: 'org-1',
  scopes: ['read', 'write'],
};

const OK_RESULT: PlaybookRunResult = {
  playbookId: 'fan-converge',
  taskGroup: 'fan-abc123',
  steps: [
    {
      kind: 'fanout',
      status: 'ok',
      fanout: {
        taskGroup: 'fan-abc123',
        workspaceIds: ['ws_claude', 'ws_codex'],
        converged: {
          workspaceId: 'ws_conv',
          branch: 'recoder/converge-deadbeef',
        },
        perAgent: [],
      },
    },
  ],
  converged: { workspaceId: 'ws_conv', branch: 'recoder/converge-deadbeef' },
};

class FakeSurface implements ConductorPlaybookSurface {
  readonly inputs: PlaybookRunInput[] = [];
  constructor(
    private readonly result: PlaybookRunResult | Error = OK_RESULT
  ) {}
  async runPlaybook(input: PlaybookRunInput): Promise<PlaybookRunResult> {
    this.inputs.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

function tools(surface: ConductorPlaybookSurface) {
  const regs = buildConductorPlaybookTools(surface);
  const list = regs.find(r => r.name === 'recoder_playbook_list');
  const run = regs.find(r => r.name === 'recoder_playbook_run');
  expect(list).toBeDefined();
  expect(run).toBeDefined();
  return { list: list!, run: run! };
}

function validArgs(overrides: Record<string, unknown> = {}) {
  return {
    playbookId: 'fan-converge',
    task: 'add a health endpoint',
    agentKinds: ['claude', 'codex'],
    repoPath: '/repo',
    spaceId: 'space-1',
    projectId: 'proj-1',
    ...overrides,
  };
}

describe('recoder_playbook_list tool', () => {
  it('returns the built-in playbook ids, descriptions, and step kinds', async () => {
    const { list } = tools(new FakeSurface());
    const out = (await list.handler({}, OWNER)) as readonly {
      id: string;
      description: string;
      steps: readonly string[];
    }[];
    const ids = out.map(p => p.id);
    expect(ids).toEqual([
      'fan-converge',
      'fan-unblock-converge',
      'fan-converge-refan',
    ]);
    expect(out.every(p => p.description.length > 0)).toBe(true);
    expect(out.find(p => p.id === 'fan-converge')?.steps).toEqual(['fanout']);
    expect(out.find(p => p.id === 'fan-unblock-converge')?.steps).toEqual([
      'fanout',
      'unblock_blocked',
    ]);
    expect(out.find(p => p.id === 'fan-converge-refan')?.steps).toEqual([
      'fanout',
      're_fan',
    ]);
  });
});

describe('recoder_playbook_run tool', () => {
  it('derives the acting identity from the caller and flows the truthful result back', async () => {
    const surface = new FakeSurface();
    const { run } = tools(surface);
    const out = (await run.handler(
      validArgs({ playbookId: 'fan-converge' }),
      OWNER
    )) as PlaybookRunResult;
    expect(out.converged).toEqual({
      workspaceId: 'ws_conv',
      branch: 'recoder/converge-deadbeef',
    });
    expect(surface.inputs).toHaveLength(1);
    const passed = surface.inputs[0];
    expect(passed.playbookId).toBe('fan-converge');
    expect(passed.actor.userId).toBe('user-1'); // from the caller, never args
    expect(passed.actor.orgId).toBe('org-1');
    expect(passed.agentKinds).toEqual(['claude', 'codex']);
    expect(passed.unblockPolicy?.autoAnswer).toBe(false); // escalate by default
  });

  it('passes followupTask + autoAnswer through when supplied', async () => {
    const surface = new FakeSurface();
    const { run } = tools(surface);
    await run.handler(
      validArgs({
        playbookId: 'fan-converge-refan',
        followupTask: 'now add tests',
        autoAnswer: true,
      }),
      OWNER
    );
    expect(surface.inputs[0].followupTask).toBe('now add tests');
    expect(surface.inputs[0].unblockPolicy?.autoAnswer).toBe(true);
  });

  it('refuses without an authenticated caller identity', async () => {
    const surface = new FakeSurface();
    const { run } = tools(surface);
    const out = (await run.handler(validArgs(), undefined)) as {
      ok: false;
      error: string;
    };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/authenticated caller/i);
    expect(surface.inputs).toHaveLength(0);
  });

  it('a non-privileged caller may NOT act as another userId', async () => {
    const surface = new FakeSurface();
    const { run } = tools(surface);
    const out = (await run.handler(
      validArgs({ userId: 'someone-else' }),
      OWNER
    )) as { ok: false; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/own userId/i);
    expect(surface.inputs).toHaveLength(0);
  });

  it('an admin caller may act as another named userId', async () => {
    const surface = new FakeSurface();
    const { run } = tools(surface);
    const admin: McpToolCaller = { userId: 'root', scopes: ['admin'] };
    await run.handler(validArgs({ userId: 'tenant-x' }), admin);
    expect(surface.inputs[0].actor.userId).toBe('tenant-x');
  });

  it('rejects an unknown playbookId (never launches)', async () => {
    const surface = new FakeSurface();
    const { run } = tools(surface);
    const out = (await run.handler(
      validArgs({ playbookId: 'nope' }),
      OWNER
    )) as { ok: false; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/unknown playbookId/i);
    expect(surface.inputs).toHaveLength(0);
  });

  it('rejects fewer than 2 distinct known agent kinds', async () => {
    const surface = new FakeSurface();
    const { run } = tools(surface);
    const out = (await run.handler(
      validArgs({ agentKinds: ['claude', 'claude'] }),
      OWNER
    )) as { ok: false; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/distinct known kinds/i);
    expect(surface.inputs).toHaveLength(0);
  });

  it('rejects an unknown agent kind', async () => {
    const surface = new FakeSurface();
    const { run } = tools(surface);
    const out = (await run.handler(
      validArgs({ agentKinds: ['claude', 'ghost'] }),
      OWNER
    )) as { ok: false; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/unknown agent kind/i);
  });

  it('requires task/repoPath/spaceId/projectId', async () => {
    const surface = new FakeSurface();
    const { run } = tools(surface);
    for (const field of ['task', 'repoPath', 'spaceId', 'projectId']) {
      const args = validArgs();
      delete (args as Record<string, unknown>)[field];
      const out = (await run.handler(args, OWNER)) as {
        ok: false;
        error: string;
      };
      expect(out.ok).toBe(false);
      expect(out.error).toContain(field);
    }
    expect(surface.inputs).toHaveLength(0);
  });

  it('propagates a truthful SERVICE_UNAVAILABLE from the unwired run seam', async () => {
    const surface = new FakeSurface(
      createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'conductor: swarm auto-unblock is not configured on this deployment'
      )
    );
    const { run } = tools(surface);
    await expect(
      run.handler(validArgs({ playbookId: 'fan-unblock-converge' }), OWNER)
    ).rejects.toBeInstanceOf(AppError);
  });
});
