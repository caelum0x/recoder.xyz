/**
 * `recoder_skill_list` + `recoder_skill_invoke` MCP tools — prove the GOVERNED,
 * owner-scoped binding: identity is the HOST caller (never `args.userId`); a
 * non-privileged caller acts only as its OWN userId (naming another is a 403); an
 * admin/internal caller may name another subject; the skill-model-unwired path
 * surfaces SERVICE_UNAVAILABLE; and the invoke result flows straight back (the tool
 * itself never executes a skill).
 */
import { describe, it, expect } from 'vitest';
import type { McpToolCaller } from '../../../shared/module-base.js';
import { AppError, ErrorCode, createError } from '../../../shared/errors.js';
import type { InvokeSkillActionResult } from '../skill/skill-action.service.js';
import {
  buildConductorSkillTools,
  type SkillInvokeSurface,
  type VerifiedSkillView,
} from './conductor-skill-tools.js';

const OWNER: McpToolCaller = { userId: 'user-1', orgId: 'org-1', scopes: ['read', 'write'] };

const VIEW: VerifiedSkillView = {
  id: 'fmt',
  version: '1.0.0',
  publisherKeyId: 'pub-1',
  actions: [
    {
      id: 'format',
      title: 'Format',
      requiredCapabilities: ['fs.write'],
      params: [{ name: 'path', type: 'string', required: true }],
    },
  ],
};

class FakeSurface implements SkillInvokeSurface {
  readonly invocations: Array<Record<string, unknown>> = [];
  constructor(
    private readonly opts: {
      wired?: boolean;
      result?: InvokeSkillActionResult;
    } = {},
  ) {}
  async listVerifiedSkills(): Promise<readonly VerifiedSkillView[]> {
    if (this.opts.wired === false) {
      throw createError(ErrorCode.SERVICE_UNAVAILABLE, 'skill model not configured');
    }
    return [VIEW];
  }
  async invokeSkillAction(input: {
    skillId: string;
    actionId: string;
    params: unknown;
    actorId: string;
    workspace: string;
  }): Promise<InvokeSkillActionResult> {
    this.invocations.push(input as Record<string, unknown>);
    if (this.opts.wired === false) {
      throw createError(ErrorCode.SERVICE_UNAVAILABLE, 'skill model not configured');
    }
    return this.opts.result ?? { status: 'executed', result: { ok: true } };
  }
}

function tools(surface: SkillInvokeSurface) {
  const regs = buildConductorSkillTools(surface);
  const list = regs.find((r) => r.name === 'recoder_skill_list')!;
  const invoke = regs.find((r) => r.name === 'recoder_skill_invoke')!;
  expect(list).toBeTruthy();
  expect(invoke).toBeTruthy();
  return { list, invoke };
}

describe('recoder_skill_list tool', () => {
  it('returns only verified skills for an authorized caller', async () => {
    const { list } = tools(new FakeSurface());
    const out = (await list.handler({}, OWNER)) as { skills: VerifiedSkillView[] };
    expect(out.skills).toEqual([VIEW]);
  });

  it('refuses without an authenticated caller (AUTH_REQUIRED)', async () => {
    const { list } = tools(new FakeSurface());
    await expect(list.handler({}, undefined)).rejects.toBeInstanceOf(AppError);
  });

  it('propagates SERVICE_UNAVAILABLE when the skill model is unwired', async () => {
    const { list } = tools(new FakeSurface({ wired: false }));
    await expect(list.handler({}, OWNER)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
  });
});

describe('recoder_skill_invoke tool', () => {
  it('invokes bound to the HOST caller identity, returning the governed result', async () => {
    const surface = new FakeSurface({ result: { status: 'executed', result: { ok: true, output: 'ok' } } });
    const { invoke } = tools(surface);
    const out = (await invoke.handler(
      { skillId: 'fmt', actionId: 'format', params: { path: 'a.ts' }, workspace: '/wt/ws1' },
      OWNER,
    )) as InvokeSkillActionResult;

    expect(out).toEqual({ status: 'executed', result: { ok: true, output: 'ok' } });
    expect(surface.invocations).toHaveLength(1);
    // Actor id is the HOST caller, never a free-form arg.
    expect(surface.invocations[0]).toMatchObject({
      skillId: 'fmt',
      actionId: 'format',
      actorId: 'user-1',
      workspace: '/wt/ws1',
    });
  });

  it('passes a needs_approval result straight back (tool never executes)', async () => {
    const surface = new FakeSurface({
      result: { status: 'needs_approval', requestId: 'appr-1', reason: 'high-risk' },
    });
    const { invoke } = tools(surface);
    const out = (await invoke.handler(
      { skillId: 'fmt', actionId: 'format', params: { path: 'a.ts' }, workspace: '/wt/ws1' },
      OWNER,
    )) as InvokeSkillActionResult;
    expect(out).toEqual({ status: 'needs_approval', requestId: 'appr-1', reason: 'high-risk' });
  });

  it('refuses (403) when a non-privileged caller names a different userId', async () => {
    const surface = new FakeSurface();
    const { invoke } = tools(surface);
    await expect(
      invoke.handler(
        { skillId: 'fmt', actionId: 'format', params: {}, workspace: '/wt/ws1', userId: 'user-2' },
        OWNER,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    expect(surface.invocations).toHaveLength(0);
  });

  it('lets an admin caller act as another subject', async () => {
    const surface = new FakeSurface();
    const { invoke } = tools(surface);
    const admin: McpToolCaller = { userId: 'root', scopes: ['admin'] };
    await invoke.handler(
      { skillId: 'fmt', actionId: 'format', params: {}, workspace: '/wt/ws1', userId: 'user-9' },
      admin,
    );
    expect(surface.invocations[0]).toMatchObject({ actorId: 'user-9' });
  });

  it('refuses without an authenticated caller (surface never invoked)', async () => {
    const surface = new FakeSurface();
    const { invoke } = tools(surface);
    await expect(
      invoke.handler({ skillId: 'fmt', actionId: 'format', params: {}, workspace: '/wt/ws1' }, undefined),
    ).rejects.toBeInstanceOf(AppError);
    expect(surface.invocations).toHaveLength(0);
  });

  it('rejects missing required fields (skillId/actionId/workspace)', async () => {
    const surface = new FakeSurface();
    const { invoke } = tools(surface);
    await expect(invoke.handler({ actionId: 'format', workspace: '/w' }, OWNER)).rejects.toMatchObject({
      code: ErrorCode.MISSING_REQUIRED_FIELD,
    });
    await expect(invoke.handler({ skillId: 'fmt', workspace: '/w' }, OWNER)).rejects.toMatchObject({
      code: ErrorCode.MISSING_REQUIRED_FIELD,
    });
    await expect(invoke.handler({ skillId: 'fmt', actionId: 'format' }, OWNER)).rejects.toMatchObject({
      code: ErrorCode.MISSING_REQUIRED_FIELD,
    });
    expect(surface.invocations).toHaveLength(0);
  });

  it('propagates SERVICE_UNAVAILABLE when the skill model is unwired', async () => {
    const surface = new FakeSurface({ wired: false });
    const { invoke } = tools(surface);
    await expect(
      invoke.handler({ skillId: 'fmt', actionId: 'format', params: {}, workspace: '/wt/ws1' }, OWNER),
    ).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
  });
});
