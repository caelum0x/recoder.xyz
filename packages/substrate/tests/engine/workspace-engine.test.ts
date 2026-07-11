/**
 * WorkspaceEngine metadata tests — the ORIGINAL prompt is persisted onto the
 * workspace record (metadata.prompt) so UIs can label the workspace by its
 * goal instead of the opaque branch/workspace id.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Workspace, TaskRun } from '@recoder/agent-os';
import { WorkspaceEngine } from '../../src/engine/workspace-engine.js';
import type { WorkspaceEngineDeps } from '../../src/engine/deps.js';

function makeDeps(): { deps: WorkspaceEngineDeps; workspaces: Map<string, Workspace> } {
  const workspaces = new Map<string, Workspace>();
  const runs = new Map<string, TaskRun>();
  let seq = 0;
  const deps: WorkspaceEngineDeps = {
    registry: {
      get: () => ({
        id: 'tmux_worktree',
        launch: async () => ({
          ref: 'sess',
          sessionName: 'sess',
          worktreePath: '/tmp/wt',
        }),
      }),
      list: () => ['tmux_worktree'],
    },
    repository: {
      upsertWorkspace: async (w) => {
        workspaces.set(w.workspaceId, w);
        return w;
      },
      getWorkspace: async (id) => workspaces.get(id) ?? null,
      listWorkspaces: async () => [...workspaces.values()],
      upsertRun: async (r) => {
        runs.set(r.runId, r);
        return r;
      },
      listRuns: async () => [...runs.values()],
      appendEvent: async (e) => e,
      listEvents: async () => [],
      listTasks: async () => [],
    },
    runTailer: { start: () => {} },
    scan: {
      listLiveSessions: async () => [],
      listConductorWorktrees: async () => [],
    },
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    clock: { now: () => new Date(0).toISOString(), nowMs: () => 0 },
    id: { newId: () => `id${++seq}` },
  };
  return { deps, workspaces };
}

test('createWorkspace persists the ORIGINAL prompt in metadata.prompt', async () => {
  const { deps } = makeDeps();
  const engine = new WorkspaceEngine(deps);
  const ws = await engine.createWorkspace({
    spaceId: 's',
    projectId: 'p',
    taskId: 't',
    runtimeId: 'claude_code',
    createdBy: 'u',
    repoPath: '/tmp/repo',
    prompt: 'add a HELLO.txt that says hi',
  });
  assert.equal(ws.state, 'running');
  assert.equal(ws.metadata?.prompt, 'add a HELLO.txt that says hi');
});

test('createWorkspace with an explicit command does not invent a prompt', async () => {
  const { deps } = makeDeps();
  const engine = new WorkspaceEngine(deps);
  const ws = await engine.createWorkspace({
    spaceId: 's',
    projectId: 'p',
    taskId: 't',
    runtimeId: 'claude_code',
    createdBy: 'u',
    repoPath: '/tmp/repo',
    command: 'echo hi',
  });
  assert.equal(ws.metadata?.prompt, undefined);
});

test('metadata.prompt survives the running transition and later metadata merges', async () => {
  const { deps, workspaces } = makeDeps();
  const engine = new WorkspaceEngine(deps);
  const ws = await engine.createWorkspace({
    spaceId: 's',
    projectId: 'p',
    taskId: 't',
    runtimeId: 'claude_code',
    createdBy: 'u',
    repoPath: '/tmp/repo',
    prompt: 'refactor the auth module',
  });
  const stored = workspaces.get(ws.workspaceId);
  assert.equal(stored?.metadata?.prompt, 'refactor the auth module');
  // lockScope was merged in during create — the prompt must not have been lost.
  assert.ok(stored?.metadata?.lockScope);
});
