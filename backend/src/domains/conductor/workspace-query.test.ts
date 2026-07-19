/**
 * Conductor board query — `module.queryWorkspaces` + `module.listArchivedWorkspaces`
 * over the real in-memory harness (composed engine + repository, no DB).
 *
 * Proves: the module fetches the state-of-record list and applies the board filters
 * (repo, agent, state, free-text q); an archived workspace is EXCLUDED from the live
 * board (`archived:false`) yet appears in the dedicated archived history; a filter
 * that matches nothing returns a truthful empty list. Read-only — querying never
 * transitions or persists anything.
 */
import { describe, it, expect } from 'vitest';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from './__fixtures__/harness.js';

describe('conductor board query (module)', () => {
  it('filters the record list by repo, agent, and state', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    await module.createWorkspace(
      makeCreateInput({ taskId: 'task_api', projectId: 'acme/api', runtimeId: 'claude_code' }),
      makePrincipal(),
    );
    await module.createWorkspace(
      makeCreateInput({ taskId: 'task_web', projectId: 'acme/web', runtimeId: 'codex' }),
      makePrincipal(),
    );

    const byRepo = await module.queryWorkspaces({ repo: 'acme/api' });
    expect(byRepo).toHaveLength(1);
    expect(byRepo[0].taskId).toBe('task_api');

    const byAgent = await module.queryWorkspaces({ agent: 'codex' });
    expect(byAgent).toHaveLength(1);
    expect(byAgent[0].taskId).toBe('task_web');

    const running = await module.queryWorkspaces({ state: 'running' });
    expect(running).toHaveLength(2);
  });

  it('free-text q matches the recorded goal/prompt', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    await module.createWorkspace(
      makeCreateInput({ taskId: 'task_a', prompt: 'Add SSO login flow' }),
      makePrincipal(),
    );
    await module.createWorkspace(
      makeCreateInput({ taskId: 'task_b', prompt: 'Fix cache eviction' }),
      makePrincipal(),
    );

    const hits = await module.queryWorkspaces({ q: 'sso' });
    expect(hits.map((w) => w.taskId)).toEqual(['task_a']);
  });

  it('an archived workspace is hidden from the live board but present in archived history', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const created = await module.createWorkspace(
      makeCreateInput({ taskId: 'task_done' }),
      makePrincipal(),
    );
    const archived = await module.archiveWorkspace(created.value!.workspaceId, makePrincipal());
    expect(archived.ok).toBe(true);
    expect(archived.value?.state).toBe('archived');

    const liveBoard = await module.queryWorkspaces({ archived: false });
    expect(liveBoard.map((w) => w.workspaceId)).not.toContain(created.value!.workspaceId);

    const history = await module.listArchivedWorkspaces();
    expect(history.map((w) => w.workspaceId)).toContain(created.value!.workspaceId);
    expect(history.every((w) => w.state === 'archived')).toBe(true);
  });

  it('a no-match filter returns a truthful empty list', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(await module.queryWorkspaces({ q: 'no-such-workspace-xyz' })).toEqual([]);
    expect(await module.queryWorkspaces({ repo: 'no-such-repo' })).toEqual([]);
  });

  it('archived history is empty when nothing is archived (never fabricated)', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(await module.listArchivedWorkspaces()).toEqual([]);
  });
});
