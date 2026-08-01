/**
 * TERMINAL panes() read model (BE-10.4) — the truthful `panes` facet on the
 * single-workspace read (`workspaceView`), projected from the engines domain's
 * read-only tmux introspection port (`listPanes`).
 *
 * Proves the degrade-truthful contract end to end:
 *  - `readWorkspacePanes` maps `ok(panes)` field-for-field (active preserved);
 *  - `ok([])` is a TRUTHFUL empty (session observed, no panes) — distinct from
 *    `undefined` (not probed / substrate not observable);
 *  - `{ ok:false }`, a thrown introspect, a missing port, or a missing session
 *    name all yield `undefined` (facet omitted, NEVER fabricated) — and the
 *    fault paths warn;
 *  - the module probes panes ONLY on the single-workspace read for live-ish
 *    states: a running workspace carries panes, a reviewed one does not, and
 *    `listWorkspaceViews` NEVER calls `listPanes` (listing must not shell out
 *    per record).
 */
import { describe, it, expect } from 'vitest';
import type { Logger } from '../../shared/logger.js';
import { ok, fail, type InvokeResult } from '../engines/types.js';
import type {
  TmuxIntrospectPort,
  TmuxPane,
} from '../engines/adapters/cli/tmux-introspect.adapter.js';
import { readWorkspacePanes } from './services/workspace-panes.js';
import { createConductorModule } from './index.js';
import {
  FakeSubstrate,
  makeConfig,
  makeCreateInput,
  makeExecutor,
  makeGate,
  makeLogger,
  makeMiddleware,
  makePrincipal,
} from './__fixtures__/harness.js';

/** A logger that records `warn` calls (otherwise noop, pino-shaped). */
function makeWarnRecorder(): { log: Logger; warns: unknown[][] } {
  const warns: unknown[][] = [];
  const log: Record<string, unknown> = {};
  const noop = () => {};
  log.info = noop;
  log.warn = (...args: unknown[]) => {
    warns.push(args);
  };
  log.error = noop;
  log.debug = noop;
  log.trace = noop;
  log.fatal = noop;
  log.child = () => log;
  return { log: log as unknown as Logger, warns };
}

/** A read-only introspect fake whose `listPanes` result is scripted + recorded. */
function makeFakeIntrospect(
  result: InvokeResult<readonly TmuxPane[]> | 'throw'
): { port: TmuxIntrospectPort; calls: (string | undefined)[] } {
  const calls: (string | undefined)[] = [];
  const port: TmuxIntrospectPort = {
    async listSessions() {
      return ok([]);
    },
    async listWindows() {
      return ok([]);
    },
    async listPanes(target?: string) {
      calls.push(target);
      if (result === 'throw') throw new Error('tmux exploded');
      return result;
    },
    async capturePane() {
      return fail('not implemented in fake', 'unavailable');
    },
    async serverInfo() {
      return fail('not implemented in fake', 'unavailable');
    },
  };
  return { port, calls };
}

const PANE_A: TmuxPane = {
  id: '%0',
  index: 0,
  pid: 4242,
  active: true,
  command: 'claude',
  path: '/tmp/worktrees/ws-1',
  width: 120,
  height: 40,
  title: 'claude — running',
};

const PANE_B: TmuxPane = {
  id: '%1',
  index: 1,
  pid: 4243,
  active: false,
  command: 'zsh',
  path: '/tmp/worktrees/ws-1',
  width: 120,
  height: 40,
};

describe('readWorkspacePanes (pure projection)', () => {
  it('maps ok(panes) field-for-field with the active flag preserved', async () => {
    const { log } = makeWarnRecorder();
    const { port, calls } = makeFakeIntrospect(ok([PANE_A, PANE_B]));

    const panes = await readWorkspacePanes(port, 'recoder-ws-1', log);

    expect(calls).toEqual(['recoder-ws-1']);
    expect(panes).toEqual([
      {
        id: '%0',
        index: 0,
        pid: 4242,
        active: true,
        command: 'claude',
        path: '/tmp/worktrees/ws-1',
        width: 120,
        height: 40,
        title: 'claude — running',
      },
      {
        id: '%1',
        index: 1,
        pid: 4243,
        active: false,
        command: 'zsh',
        path: '/tmp/worktrees/ws-1',
        width: 120,
        height: 40,
      },
    ]);
  });

  it('ok([]) → truthful empty list (session observed, no panes) — NOT undefined', async () => {
    const { log, warns } = makeWarnRecorder();
    const { port } = makeFakeIntrospect(ok([]));

    const panes = await readWorkspacePanes(port, 'recoder-ws-1', log);

    expect(panes).toEqual([]);
    expect(panes).not.toBeUndefined();
    expect(warns).toHaveLength(0);
  });

  it('{ ok:false } → undefined (missing signal) + a truthful warn', async () => {
    const { log, warns } = makeWarnRecorder();
    const { port } = makeFakeIntrospect(
      fail('tmux is not installed on this host', 'unavailable')
    );

    const panes = await readWorkspacePanes(port, 'recoder-ws-1', log);

    expect(panes).toBeUndefined();
    expect(warns).toHaveLength(1);
  });

  it('introspect port absent → undefined (facet not probed, never fabricated)', async () => {
    const { log, warns } = makeWarnRecorder();
    expect(
      await readWorkspacePanes(undefined, 'recoder-ws-1', log)
    ).toBeUndefined();
    expect(warns).toHaveLength(0);
  });

  it('no sessionName → undefined without touching the port', async () => {
    const { log } = makeWarnRecorder();
    const { port, calls } = makeFakeIntrospect(ok([PANE_A]));

    expect(await readWorkspacePanes(port, undefined, log)).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('a throwing introspect → undefined + warn (never rejects)', async () => {
    const { log, warns } = makeWarnRecorder();
    const { port } = makeFakeIntrospect('throw');

    await expect(
      readWorkspacePanes(port, 'recoder-ws-1', log)
    ).resolves.toBeUndefined();
    expect(warns).toHaveLength(1);
  });
});

/** Compose a conductor module with an injected tmux introspect port. */
function composeWithIntrospect(tmuxIntrospect: TmuxIntrospectPort) {
  return createConductorModule({
    config: makeConfig(),
    logger: makeLogger(),
    executor: makeExecutor(false),
    middleware: makeMiddleware(),
    gate: makeGate('allow'),
    substrates: [new FakeSubstrate()],
    tmuxIntrospect,
  });
}

describe('conductor workspaceView panes facet (module wiring)', () => {
  it('a running workspace with a session carries the panes facet', async () => {
    const { port, calls } = makeFakeIntrospect(ok([PANE_A, PANE_B]));
    const module = composeWithIntrospect(port);
    const created = await module.createWorkspace(
      makeCreateInput(),
      makePrincipal()
    );
    expect(created.value?.state).toBe('running');
    expect(created.value?.sessionName).toBeTruthy();

    const view = await module.workspaceView(created.value!.workspaceId);

    expect(view?.panes).toHaveLength(2);
    expect(view?.panes?.[0]?.command).toBe('claude');
    expect(view?.panes?.[0]?.active).toBe(true);
    expect(view?.panes?.[1]?.active).toBe(false);
    // The probe targeted the workspace's OWN tmux session.
    expect(calls).toEqual([created.value!.sessionName]);
  });

  it('a non-live (reviewed) workspace does not probe and carries no panes', async () => {
    const { port, calls } = makeFakeIntrospect(ok([PANE_A]));
    const module = composeWithIntrospect(port);
    const created = await module.createWorkspace(
      makeCreateInput(),
      makePrincipal()
    );
    await module.advanceWorkspaceState(
      created.value!.workspaceId,
      'awaiting_review',
      makePrincipal()
    );

    const view = await module.workspaceView(created.value!.workspaceId);

    expect(view?.state).toBe('awaiting_review');
    expect(view?.panes).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('an unavailable introspect ⇒ the facet is omitted, never a fabricated []', async () => {
    const { port } = makeFakeIntrospect(fail('tmux gone', 'unavailable'));
    const module = composeWithIntrospect(port);
    const created = await module.createWorkspace(
      makeCreateInput(),
      makePrincipal()
    );

    const view = await module.workspaceView(created.value!.workspaceId);

    expect(view).not.toBeNull();
    expect(view?.panes).toBeUndefined();
    expect('panes' in (view ?? {})).toBe(false);
  });

  it('listWorkspaceViews NEVER calls listPanes (listing must not shell out per record)', async () => {
    const { port, calls } = makeFakeIntrospect(ok([PANE_A]));
    const module = composeWithIntrospect(port);
    await module.createWorkspace(
      makeCreateInput({ taskId: 'task_a' }),
      makePrincipal()
    );
    await module.createWorkspace(
      makeCreateInput({ taskId: 'task_b' }),
      makePrincipal()
    );

    const views = await module.listWorkspaceViews();

    expect(views).toHaveLength(2);
    expect(calls).toHaveLength(0);
    for (const view of views) expect(view.panes).toBeUndefined();
  });
});
