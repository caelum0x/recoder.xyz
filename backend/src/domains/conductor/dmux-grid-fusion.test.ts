/**
 * dmux LAYOUT-brain → F3 worktree-bound compare grid + tenant-gated attach hint
 * (design §8.3 item 26) — the fusion regression lock.
 *
 * Two seams under test:
 *  1. The MODULE (`composeConductor` + a recording fake `WorkspaceGridPort`): the
 *     compare read carries a read-only attach hint; `arrangeCompareGrid` feeds the
 *     REAL sibling worktrees (each pane cwd == its own worktree, in order — NEVER
 *     one shared repoPath, NEVER empty panes); degrade-truthful when dmux is
 *     absent / worktrees are missing; and the arrange is governance-gated.
 *  2. The ADAPTER (`createDmuxGridAdapter` + fake engine ports): `attachCommand`
 *     is emitted ONLY in the single-tenant desktop composition (`visibleSessions`
 *     is intersected to the group and always emitted); `arrangeGrid` binds each
 *     pane to its own worktree; every degrade path returns `null`.
 */
import { describe, it, expect } from 'vitest';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makeGate,
  makePrincipal,
} from './__fixtures__/harness.js';
import { createDmuxGridAdapter } from './adapters/dmux-grid.adapter.js';
import type {
  GroupAttachHint,
  GroupGridArrangement,
  GroupWorktree,
  WorkspaceGridPort,
} from './ports/workspace-grid.port.js';
import type { DmuxLayoutPort } from '../engines/dmux-adapter.js';
import type { EngineClientPort, EngineCall } from '../engines/ports/engine-client.port.js';
import type { EngineHealth, InvokeResult } from '../engines/types.js';

/** A FakeSubstrate whose diff reports a real `git diff --stat` summary line. */
function statSubstrate() {
  return new FakeSubstrate({
    diff: { stat: ' 1 file changed, 2 insertions(+)', patch: '', untracked: [], changedFiles: 1 },
  });
}

/** Launch one sibling tagged into `taskGroup`, run by `agent`. */
async function launchSibling(
  module: ReturnType<typeof composeConductor>['module'],
  taskGroup: string,
  agent: string,
) {
  const created = await module.createWorkspace(
    makeCreateInput({ runtimeId: agent, command: 'agent-run', metadata: { taskGroup } }),
    makePrincipal(),
  );
  return created.value!;
}

/** A recording fake {@link WorkspaceGridPort} whose responses are configurable. */
function recordingGrid(config?: {
  attach?: GroupAttachHint | null;
  arrange?: (input: { taskGroup: string; worktrees: readonly GroupWorktree[] }) => GroupGridArrangement | null;
}) {
  const attachCalls: { repoPath: string; groupSessionNames: readonly string[] }[] = [];
  const arrangeCalls: { taskGroup: string; worktrees: readonly GroupWorktree[] }[] = [];
  const port: WorkspaceGridPort = {
    async available() {
      return true;
    },
    async attachHint(input) {
      attachCalls.push(input);
      return config?.attach === undefined
        ? { visibleSessions: input.groupSessionNames }
        : config.attach;
    },
    async arrangeGrid(input) {
      arrangeCalls.push(input);
      if (config?.arrange) return config.arrange(input);
      return {
        sessionName: `recoder-group-${input.taskGroup}`,
        worktreePaths: input.worktrees.map((w) => w.worktreePath),
        paneCount: input.worktrees.length,
        layout: 'agent-grid',
        visibleSessions: [`recoder-group-${input.taskGroup}`],
      };
    },
  };
  return { port, attachCalls, arrangeCalls };
}

describe('conductor dmux grid fusion — module seam', () => {
  it('arranges a WORKTREE-BOUND agent-grid (each pane cwd == its sibling worktree, in order)', async () => {
    const grid = recordingGrid();
    const { module } = composeConductor({ substrates: [statSubstrate()], workspaceGrid: grid.port });
    await launchSibling(module, 'grp_1', 'claude_code');
    await launchSibling(module, 'grp_1', 'codex');
    await launchSibling(module, 'grp_1', 'opencode');

    // The compare view is the truth source for the ordered sibling worktrees.
    const compare = await module.compareTaskGroup('grp_1');
    const siblingWorktrees = compare.siblings.map((s) => s.worktreePath);
    expect(siblingWorktrees.every((p) => typeof p === 'string')).toBe(true);

    const arranged = await module.arrangeCompareGrid('grp_1', makePrincipal());

    expect(arranged.ok).toBe(true);
    expect(grid.arrangeCalls).toHaveLength(1);
    const passed = grid.arrangeCalls[0];
    expect(passed.taskGroup).toBe('grp_1');
    // Each pane bound to its OWN sibling worktree, in sibling order.
    expect(passed.worktrees.map((w) => w.worktreePath)).toEqual(siblingWorktrees);
    expect(passed.worktrees.map((w) => w.workspaceId)).toEqual(
      compare.siblings.map((s) => s.workspaceId),
    );
    // NOT a single shared cwd + NOT empty panes: 3 DISTINCT worktree paths.
    expect(new Set(passed.worktrees.map((w) => w.worktreePath)).size).toBe(3);
    expect(arranged.value).toMatchObject({
      sessionName: 'recoder-group-grp_1',
      worktreePaths: siblingWorktrees,
      paneCount: 3,
      layout: 'agent-grid',
    });
  });

  it('surfaces the read-only attach hint on the compare read model', async () => {
    const grid = recordingGrid({ attach: { visibleSessions: ['recoder-x'], attachCommand: 'dmux /repo' } });
    const { module } = composeConductor({ substrates: [statSubstrate()], workspaceGrid: grid.port });
    const a = await launchSibling(module, 'grp_1', 'claude_code');
    await launchSibling(module, 'grp_1', 'codex');

    const compare = await module.compareTaskGroup('grp_1');

    expect(compare.grid).toEqual({ visibleSessions: ['recoder-x'], attachCommand: 'dmux /repo' });
    expect(grid.attachCalls).toHaveLength(1);
    // The hint is queried with the group's real sessions + a member worktree path.
    expect(grid.attachCalls[0].groupSessionNames).toContain(a.sessionName);
    expect(typeof grid.attachCalls[0].repoPath).toBe('string');
  });

  it('singleton/ungrouped view ⇒ no grid hint, no arrange, no attachHint call', async () => {
    const grid = recordingGrid();
    const { module } = composeConductor({ substrates: [statSubstrate()], workspaceGrid: grid.port });
    await launchSibling(module, 'grp_solo', 'claude_code');

    const compare = await module.compareTaskGroup('grp_solo');
    expect(compare.count).toBe(1);
    expect(compare.grid).toBeUndefined();
    expect(grid.attachCalls).toHaveLength(0);

    const arranged = await module.arrangeCompareGrid('grp_solo', makePrincipal());
    expect(arranged.ok).toBe(true);
    expect(arranged.value).toBeNull();
    expect(grid.arrangeCalls).toHaveLength(0);
  });

  it('degrade-truthful: dmux absent ⇒ no grid + no hint, the compare still returns', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] }); // no workspaceGrid
    await launchSibling(module, 'grp_1', 'claude_code');
    await launchSibling(module, 'grp_1', 'codex');

    const compare = await module.compareTaskGroup('grp_1');
    expect(compare.count).toBe(2); // the read model is intact
    expect(compare.grid).toBeUndefined(); // hint-less, never fabricated

    const arranged = await module.arrangeCompareGrid('grp_1', makePrincipal());
    expect(arranged.ok).toBe(true);
    expect(arranged.value).toBeNull(); // truthful null, never a fabricated grid
  });

  it('degrade-truthful: <2 siblings with a real worktree ⇒ null, NO buildWorktreeGrid call', async () => {
    // No substrate wired ⇒ launches fail with no worktree, but the tagged records
    // persist. The group has 0 real worktrees ⇒ no honest N-way grid to build.
    const grid = recordingGrid();
    const { module } = composeConductor({ substrates: [], workspaceGrid: grid.port });
    await launchSibling(module, 'grp_fail', 'claude_code');
    await launchSibling(module, 'grp_fail', 'codex');

    const arranged = await module.arrangeCompareGrid('grp_fail', makePrincipal());
    expect(arranged.ok).toBe(true);
    expect(arranged.value).toBeNull();
    expect(grid.arrangeCalls).toHaveLength(0); // never a hollow one-dir grid
  });

  it('degrade-truthful: a tmux fault (arrangeGrid ⇒ null) never fabricates an arrangement', async () => {
    const grid = recordingGrid({ arrange: () => null });
    const { module } = composeConductor({ substrates: [statSubstrate()], workspaceGrid: grid.port });
    await launchSibling(module, 'grp_1', 'claude_code');
    await launchSibling(module, 'grp_1', 'codex');

    const arranged = await module.arrangeCompareGrid('grp_1', makePrincipal());
    expect(arranged.ok).toBe(true);
    expect(arranged.value).toBeNull();
    expect(grid.arrangeCalls).toHaveLength(1); // it was attempted, but degraded truthfully
  });

  it('arrange is governed — a deny verdict blocks it, no buildWorktreeGrid call', async () => {
    const grid = recordingGrid();
    const gate = makeGate('deny');
    const { module } = composeConductor({
      substrates: [statSubstrate()],
      workspaceGrid: grid.port,
      gate,
    });
    await launchSibling(module, 'grp_1', 'claude_code');
    await launchSibling(module, 'grp_1', 'codex');

    const arranged = await module.arrangeCompareGrid('grp_1', makePrincipal());
    expect(arranged.ok).toBe(false);
    expect(arranged.verdict.effect).toBe('deny');
    expect(grid.arrangeCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Adapter seam: createDmuxGridAdapter over fake engine ports (tenant gate).
// ---------------------------------------------------------------------------

function okResult<T>(value: T): InvokeResult<T> {
  return { ok: true, value };
}
function failResult<T = never>(reason: string): InvokeResult<T> {
  return { ok: false, reason };
}

/** A recording fake dmux `EngineClientPort` with per-op canned responses. */
function fakeClient(responses: {
  sessions?: InvokeResult<unknown>;
  attach?: InvokeResult<unknown>;
  availability?: InvokeResult<unknown>;
}): EngineClientPort & { invokes: EngineCall<unknown>[] } {
  const invokes: EngineCall<unknown>[] = [];
  return {
    id: 'dmux',
    transport: 'cli',
    invokes,
    async start() {},
    async stop() {},
    async invoke(call: EngineCall<unknown>) {
      invokes.push(call);
      if (call.op === 'sessions') return responses.sessions ?? okResult({ sessions: [] });
      if (call.op === 'attach-command') return responses.attach ?? okResult({ command: 'dmux /repo' });
      if (call.op === 'availability') return responses.availability ?? okResult({ available: true });
      return failResult('unknown op');
    },
    async health(): Promise<EngineHealth> {
      return { engineId: 'dmux', transport: 'cli', status: 'up', checkedAt: new Date().toISOString() };
    },
  };
}

/** A fake {@link DmuxLayoutPort} that only implements the grid verb the adapter uses. */
function fakeLayout(
  build: (input: { session: string; worktrees: readonly { workspaceId: string; worktreePath: string }[] }) => InvokeResult<unknown>,
): DmuxLayoutPort & { calls: { session: string; worktrees: readonly { workspaceId: string; worktreePath: string }[] }[] } {
  const calls: { session: string; worktrees: readonly { workspaceId: string; worktreePath: string }[] }[] = [];
  const port = {
    async buildWorktreeGrid(input: { session: string; worktrees: readonly { workspaceId: string; worktreePath: string }[] }) {
      calls.push(input);
      return build(input);
    },
  } as unknown as DmuxLayoutPort & { calls: typeof calls };
  (port as { calls: typeof calls }).calls = calls;
  return port as DmuxLayoutPort & { calls: typeof calls };
}

describe('createDmuxGridAdapter — tenant gate + worktree binding', () => {
  const noBuild = fakeLayout(() => failResult('unused'));

  it('desktop (singleTenant): emits attachCommand + intersects visibleSessions to the group', async () => {
    const client = fakeClient({
      sessions: okResult({ sessions: ['recoder-a', 'recoder-b', 'recoder-other'] }),
      attach: okResult({ command: 'dmux /repo' }),
    });
    const adapter = createDmuxGridAdapter({ layout: noBuild, client, singleTenant: true });

    const hint = await adapter.attachHint({ repoPath: '/repo', groupSessionNames: ['recoder-a', 'recoder-b'] });

    expect(hint).not.toBeNull();
    expect(hint!.visibleSessions).toEqual(['recoder-a', 'recoder-b']); // recoder-other excluded
    expect(hint!.attachCommand).toBe('dmux /repo');
    expect(client.invokes.some((c) => c.op === 'attach-command')).toBe(true);
  });

  it('shared/prod (default): withholds attachCommand, still emits intersected visibleSessions, NO attach-command invoke', async () => {
    const client = fakeClient({
      sessions: okResult({ sessions: ['recoder-a', 'recoder-b', 'recoder-other'] }),
    });
    const adapter = createDmuxGridAdapter({ layout: noBuild, client }); // singleTenant defaults false

    const hint = await adapter.attachHint({ repoPath: '/repo', groupSessionNames: ['recoder-a', 'recoder-b'] });

    expect(hint).not.toBeNull();
    expect(hint!.visibleSessions).toEqual(['recoder-a', 'recoder-b']);
    expect(hint!.attachCommand).toBeUndefined(); // tenant gate withholds the box-wide line
    expect(client.invokes.some((c) => c.op === 'attach-command')).toBe(false);
  });

  it('attachHint degrades to null when the sessions op fails', async () => {
    const client = fakeClient({ sessions: failResult('tmux not runnable') });
    const adapter = createDmuxGridAdapter({ layout: noBuild, client, singleTenant: true });
    expect(await adapter.attachHint({ repoPath: '/repo', groupSessionNames: ['recoder-a'] })).toBeNull();
  });

  it('arrangeGrid binds each pane to its own worktree (session = recoder-group-<g>)', async () => {
    const layout = fakeLayout((input) =>
      okResult({
        session: input.session,
        created: true,
        worktreePaths: input.worktrees.map((w) => w.worktreePath),
        panes: [],
        layout: 'agent-grid',
      }),
    );
    const client = fakeClient({});
    const adapter = createDmuxGridAdapter({ layout, client, singleTenant: true });
    const worktrees: GroupWorktree[] = [
      { workspaceId: 'a', worktreePath: '/wt/a' },
      { workspaceId: 'b', worktreePath: '/wt/b' },
      { workspaceId: 'c', worktreePath: '/wt/c' },
    ];

    const arr = await adapter.arrangeGrid({ taskGroup: 'g', worktrees });

    expect(layout.calls).toHaveLength(1);
    expect(layout.calls[0].session).toBe('recoder-group-g');
    expect(layout.calls[0].worktrees.map((w) => w.worktreePath)).toEqual(['/wt/a', '/wt/b', '/wt/c']);
    expect(arr).toMatchObject({
      sessionName: 'recoder-group-g',
      worktreePaths: ['/wt/a', '/wt/b', '/wt/c'],
      paneCount: 3,
      layout: 'agent-grid',
    });
  });

  it('arrangeGrid degrades to null on a build fault + skips the build with no real worktrees', async () => {
    const failing = fakeLayout(() => okResult({ ok: false })); // shape ignored; use failResult path below
    const layoutFail = fakeLayout(() => failResult('no tmux'));
    const client = fakeClient({});

    const onFault = createDmuxGridAdapter({ layout: layoutFail, client });
    expect(
      await onFault.arrangeGrid({ taskGroup: 'g', worktrees: [{ workspaceId: 'a', worktreePath: '/wt/a' }] }),
    ).toBeNull();

    const onEmpty = createDmuxGridAdapter({ layout: failing, client });
    expect(await onEmpty.arrangeGrid({ taskGroup: 'g', worktrees: [] })).toBeNull();
    expect((failing as unknown as { calls: unknown[] }).calls).toHaveLength(0); // never attempted a hollow grid
  });
});
