/**
 * Composer wiring: on a successful launch the conductor injects the Recoder
 * `.mcp.json` into the workspace's worktree; a launch without a worktree path (or
 * with no injector wired) is a truthful skip that never fails the launch.
 */
import { describe, it, expect } from 'vitest';
import type { McpInjectPort, McpInjectResult } from './ports/mcp-inject.port.js';
import { composeConductor, FakeSubstrate, makeCreateInput, makePrincipal } from './__fixtures__/harness.js';

/** A recording injector; `fail` makes it throw (proving the composer isolates faults). */
function makeInjector(fail = false): McpInjectPort & { calls: (string | null | undefined)[] } {
  const calls: (string | null | undefined)[] = [];
  return {
    calls,
    async inject(worktreePath): Promise<McpInjectResult> {
      calls.push(worktreePath);
      if (fail) throw new Error('boom');
      return { injected: true, path: `${worktreePath}/.mcp.json`, changed: true };
    },
  };
}

describe('conductor .mcp.json injection wiring', () => {
  it('injects into the worktree after an allowed createWorkspace', async () => {
    const injector = makeInjector();
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], mcpInject: injector });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(result.ok).toBe(true);

    // The FakeSubstrate launches with a worktreePath; the injector saw it.
    expect(injector.calls).toHaveLength(1);
    expect(injector.calls[0]).toBe(result.value?.worktreePath);
    expect(injector.calls[0]).toBeTruthy();
  });

  it('an injection fault never fails an otherwise-successful launch', async () => {
    const injector = makeInjector(true);
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], mcpInject: injector });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());
    // Launch still succeeds; the injector was still invoked.
    expect(result.ok).toBe(true);
    expect(injector.calls).toHaveLength(1);
  });

  it('no injector wired ⇒ launch still succeeds (truthful skip)', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(result.ok).toBe(true);
  });
});
