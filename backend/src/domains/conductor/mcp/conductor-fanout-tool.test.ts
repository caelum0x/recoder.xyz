/**
 * `recoder_converge_fanout` MCP tool — proves the thin binding does not turn
 * model-supplied input into tenant authority: the host caller owns the principal,
 * only elevated callers may name another subject, malformed fan-outs never reach
 * the service, and the parallelism cap is enforced before launch.
 */
import { describe, expect, it } from 'vitest';
import type { McpToolCaller } from '../../../shared/module-base.js';
import type {
  FanoutInput,
  FanoutResult,
} from '../fanout/converge-fanout.service.js';
import {
  buildConductorFanoutTools,
  type ConvergeFanoutSurface,
} from './conductor-fanout-tool.js';

const OWNER: McpToolCaller = {
  userId: 'user-1',
  orgId: 'org-1',
  scopes: ['read', 'write'],
};

const OK_RESULT: FanoutResult = {
  taskGroup: 'fan-123',
  workspaceIds: ['ws_claude', 'ws_codex'],
  converged: null,
  convergeReason: 'test result',
  perAgent: [],
};

class FakeSurface implements ConvergeFanoutSurface {
  readonly inputs: FanoutInput[] = [];

  async fanout(input: FanoutInput): Promise<FanoutResult> {
    this.inputs.push(input);
    return OK_RESULT;
  }
}

function tool(surface: ConvergeFanoutSurface) {
  const [registration] = buildConductorFanoutTools(surface);
  expect(registration.name).toBe('recoder_converge_fanout');
  return registration;
}

function validArgs(overrides: Record<string, unknown> = {}) {
  return {
    task: 'add a health endpoint',
    agentKinds: ['claude', 'codex'],
    repoPath: '/repo',
    spaceId: 'space-1',
    projectId: 'project-1',
    ...overrides,
  };
}

describe('recoder_converge_fanout tool', () => {
  it('binds the governed principal to the host caller', async () => {
    const surface = new FakeSurface();
    const registration = tool(surface);

    await registration.handler(validArgs({ settleTimeoutMs: 1234 }), OWNER);

    expect(surface.inputs).toHaveLength(1);
    expect(surface.inputs[0]).toMatchObject({
      task: 'add a health endpoint',
      agentKinds: ['claude', 'codex'],
      actor: { userId: 'user-1', orgId: 'org-1', scopes: ['read', 'write'] },
      settleTimeoutMs: 1234,
    });
  });

  it('refuses a non-privileged caller naming another userId (no IDOR)', async () => {
    const surface = new FakeSurface();
    const out = (await tool(surface).handler(
      validArgs({ userId: 'user-2' }),
      OWNER
    )) as { ok: false; error: string };

    expect(out).toMatchObject({ ok: false });
    expect(out.error).toMatch(/own userId/i);
    expect(surface.inputs).toHaveLength(0);
  });

  it('permits an admin caller to act as a named subject', async () => {
    const surface = new FakeSurface();
    await tool(surface).handler(
      validArgs({ userId: 'user-2' }),
      { userId: 'root', scopes: ['admin'] }
    );

    expect(surface.inputs[0]?.actor.userId).toBe('user-2');
    expect(surface.inputs[0]?.actor.scopes).toEqual(['admin']);
  });

  it('refuses an absent authenticated caller', async () => {
    const surface = new FakeSurface();
    const out = (await tool(surface).handler(validArgs())) as {
      ok: false;
      error: string;
    };

    expect(out.error).toMatch(/authenticated caller/i);
    expect(surface.inputs).toHaveLength(0);
  });

  it('rejects unknown and duplicate-only agent kinds before launch', async () => {
    const surface = new FakeSurface();
    const registration = tool(surface);

    const unknown = (await registration.handler(
      validArgs({ agentKinds: ['claude', 'unknown'] }),
      OWNER
    )) as { ok: false; error: string };
    expect(unknown.error).toMatch(/unknown agent kind/i);

    const duplicateOnly = (await registration.handler(
      validArgs({ agentKinds: ['claude', 'claude'] }),
      OWNER
    )) as { ok: false; error: string };
    expect(duplicateOnly.error).toMatch(/distinct known kinds/i);
    expect(surface.inputs).toHaveLength(0);
  });

  it('clamps more than six distinct known kinds before launch', async () => {
    const surface = new FakeSurface();
    await tool(surface).handler(
      validArgs({
        agentKinds: [
          'claude',
          'codex',
          'cursor',
          'opencode',
          'pi',
          'gemini',
          'recoder_code',
        ],
      }),
      OWNER
    );

    expect(surface.inputs[0]?.agentKinds).toEqual([
      'claude',
      'codex',
      'cursor',
      'opencode',
      'pi',
      'gemini',
    ]);
  });

  it('requires task, repoPath, spaceId, and projectId before launch', async () => {
    const surface = new FakeSurface();
    const registration = tool(surface);

    for (const field of ['task', 'repoPath', 'spaceId', 'projectId']) {
      const args = validArgs();
      delete (args as Record<string, unknown>)[field];
      const out = (await registration.handler(args, OWNER)) as {
        ok: false;
        error: string;
      };
      expect(out.error).toContain(field);
    }
    expect(surface.inputs).toHaveLength(0);
  });
});
