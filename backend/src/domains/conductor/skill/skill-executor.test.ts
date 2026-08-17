/**
 * Contract tests for `createCapabilityDispatchExecutor` — the concrete skill
 * executor. Proves the FAIL-CLOSED capability dispatch: an action runs ONLY when
 * EVERY declared capability has a wired built-in handler; anything else is a
 * truthful refusal (never arbitrary execution, never a fabricated success).
 */
import { describe, it, expect, vi } from 'vitest';
import { createCapabilityDispatchExecutor, type SkillCapabilityHandler } from './skill-executor.js';
import type { SkillActionContext } from './skill.types.js';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

function ctx(capabilities: string[], overrides: Partial<SkillActionContext> = {}): SkillActionContext {
  return {
    skillId: 'skill-1',
    actionId: 'act-1',
    params: { path: 'README.md' },
    capabilities,
    workspace: '/worktrees/ws-1',
    ...overrides,
  };
}

function handler(fn: SkillCapabilityHandler['execute']): SkillCapabilityHandler {
  return { execute: fn };
}

describe('createCapabilityDispatchExecutor', () => {
  it('refuses (fail-closed) when NO handlers are wired — the honest "wired but nothing enabled" state', async () => {
    const exec = createCapabilityDispatchExecutor({ handlers: {}, logger: log });
    const out = await exec.execute(ctx(['workspace.read']));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/no handler wired for capability: workspace\.read/);
  });

  it('refuses an action that declares no capabilities (nothing to run)', async () => {
    const exec = createCapabilityDispatchExecutor({ handlers: {}, logger: log });
    const out = await exec.execute(ctx([]));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/no capabilities/);
  });

  it('runs a single wired capability and returns its output verbatim, scoped to the context', async () => {
    const seen: SkillActionContext[] = [];
    const exec = createCapabilityDispatchExecutor({
      handlers: {
        'workspace.read': handler(async (c) => {
          seen.push(c);
          return { ok: true, output: { bytes: 42 } };
        }),
      },
      logger: log,
    });
    const out = await exec.execute(ctx(['workspace.read']));
    expect(out).toEqual({ ok: true, output: { bytes: 42 } });
    // The handler received ONLY the capability-scoped context (params + worktree).
    expect(seen[0].workspace).toBe('/worktrees/ws-1');
    expect(seen[0].params).toEqual({ path: 'README.md' });
  });

  it('refuses the WHOLE action when ANY capability of a multi-capability action is unhandled', async () => {
    const ran = vi.fn(async () => ({ ok: true as const }));
    const exec = createCapabilityDispatchExecutor({
      handlers: { 'workspace.read': handler(ran) },
      logger: log,
    });
    const out = await exec.execute(ctx(['workspace.read', 'workspace.write']));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/workspace\.write/);
    // Fail-closed admission happens BEFORE any handler runs — no partial execution.
    expect(ran).not.toHaveBeenCalled();
  });

  it('aggregates outputs of a fully-handled multi-capability action', async () => {
    const exec = createCapabilityDispatchExecutor({
      handlers: {
        'a': handler(async () => ({ ok: true, output: 1 })),
        'b': handler(async () => ({ ok: true, output: 2 })),
      },
      logger: log,
    });
    const out = await exec.execute(ctx(['a', 'b']));
    expect(out).toEqual({ ok: true, output: { a: 1, b: 2 } });
  });

  it('a capability refusal fails the whole action (never a partial success)', async () => {
    const exec = createCapabilityDispatchExecutor({
      handlers: {
        'a': handler(async () => ({ ok: true, output: 1 })),
        'b': handler(async () => ({ ok: false, error: 'denied by handler b' })),
      },
      logger: log,
    });
    const out = await exec.execute(ctx(['a', 'b']));
    expect(out).toEqual({ ok: false, error: 'denied by handler b' });
  });

  it('isolates a throwing handler into a truthful failure (never crashes)', async () => {
    const exec = createCapabilityDispatchExecutor({
      handlers: { 'a': handler(async () => { throw new Error('boom'); }) },
      logger: log,
    });
    const out = await exec.execute(ctx(['a']));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/capability 'a' failed: boom/);
  });
});
