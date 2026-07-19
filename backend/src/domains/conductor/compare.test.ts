/**
 * Multi-agent compare (product F3) — the side-by-side aggregate of a parallel-run
 * group (`compareTaskGroup` / `workspaceSiblings`) the composer builds over the
 * compare service.
 *
 * Proves: N siblings sharing a `metadata.taskGroup` aggregate into one view with a
 * per-agent row (agent + diffStat + outcome + runId); a single-run group yields a
 * one-row view; an unknown/blank group is a truthful EMPTY view (never an error,
 * never invented rows); an ungrouped workspace is its own singleton sibling set; a
 * missing workspace is null; a sibling with no worktree reports an ABSENT diffStat
 * with a truthful reason (never a fabricated `0/0/0`).
 */
import { describe, it, expect } from 'vitest';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from './__fixtures__/harness.js';
import { parseDiffStat, taskGroupOf } from './services/compare.service.js';

/** A FakeSubstrate whose diff reports a real `git diff --stat` summary line. */
function statSubstrate() {
  return new FakeSubstrate({
    diff: {
      stat: ' 3 files changed, 45 insertions(+), 12 deletions(-)',
      patch: '',
      untracked: [],
      changedFiles: 3,
    },
  });
}

/** Create a workspace tagged into `taskGroup`, run by `agent`. `command` bypasses CLI resolution. */
async function launchSibling(
  module: ReturnType<typeof composeConductor>['module'],
  taskGroup: string,
  agent: string,
) {
  const created = await module.createWorkspace(
    makeCreateInput({
      runtimeId: agent,
      command: 'agent-run',
      metadata: { taskGroup },
    }),
    makePrincipal(),
  );
  return created.value!;
}

describe('conductor multi-agent compare', () => {
  it('aggregates N siblings of a parallel-run group side-by-side', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    await launchSibling(module, 'grp_1', 'claude_code');
    await launchSibling(module, 'grp_1', 'codex');
    await launchSibling(module, 'grp_1', 'opencode');
    // A workspace in ANOTHER group must never leak into grp_1's compare.
    await launchSibling(module, 'grp_other', 'claude_code');

    const compare = await module.compareTaskGroup('grp_1');

    expect(compare.taskGroup).toBe('grp_1');
    expect(compare.count).toBe(3);
    expect(compare.siblings).toHaveLength(3);

    const agents = compare.siblings.map((s) => s.agent).sort();
    expect(agents).toEqual(['claude_code', 'codex', 'opencode']);

    for (const sib of compare.siblings) {
      expect(sib.runtimeId).toBe(sib.agent);
      expect(sib.state).toBe('running');
      // outcome half: attention is populated (running → truthful 'unknown' here).
      expect(sib.attention).toBeDefined();
      // diffStat parsed from the substrate's --stat summary.
      expect(sib.diffStat).toEqual({ files: 3, additions: 45, deletions: 12 });
      expect(sib.diffStatReason).toBeUndefined();
    }
  });

  it('single-run group → a one-row compare view', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    await launchSibling(module, 'grp_solo', 'claude_code');

    const compare = await module.compareTaskGroup('grp_solo');

    expect(compare.taskGroup).toBe('grp_solo');
    expect(compare.count).toBe(1);
    expect(compare.siblings[0].agent).toBe('claude_code');
    expect(compare.siblings[0].diffStat).toEqual({ files: 3, additions: 45, deletions: 12 });
  });

  it('unknown group → truthful empty view (never an error, never invented rows)', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    await launchSibling(module, 'grp_1', 'claude_code');

    const compare = await module.compareTaskGroup('grp_does_not_exist');

    expect(compare.taskGroup).toBe('grp_does_not_exist');
    expect(compare.count).toBe(0);
    expect(compare.siblings).toEqual([]);
  });

  it('blank taskGroup → truthful empty view with a null group key', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    const compare = await module.compareTaskGroup('   ');
    expect(compare.taskGroup).toBeNull();
    expect(compare.count).toBe(0);
    expect(compare.siblings).toEqual([]);
  });

  it('workspaceSiblings resolves the group a workspace belongs to', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    const a = await launchSibling(module, 'grp_2', 'claude_code');
    await launchSibling(module, 'grp_2', 'codex');

    const compare = await module.workspaceSiblings(a.workspaceId);

    expect(compare).not.toBeNull();
    expect(compare!.taskGroup).toBe('grp_2');
    expect(compare!.count).toBe(2);
    expect(compare!.siblings.map((s) => s.workspaceId)).toContain(a.workspaceId);
  });

  it('ungrouped workspace → its own singleton sibling set (null group)', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    const created = await module.createWorkspace(
      makeCreateInput({ runtimeId: 'claude_code', command: 'agent-run' }),
      makePrincipal(),
    );

    const compare = await module.workspaceSiblings(created.value!.workspaceId);

    expect(compare).not.toBeNull();
    expect(compare!.taskGroup).toBeNull();
    expect(compare!.count).toBe(1);
    expect(compare!.siblings[0].workspaceId).toBe(created.value!.workspaceId);
  });

  it('returns null siblings for a missing workspace', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    expect(await module.workspaceSiblings('ws_missing')).toBeNull();
  });

  it('a sibling with no worktree reports an absent diffStat + truthful reason', async () => {
    // No substrate wired ⇒ the launch fails with no worktree, but the record (and
    // its taskGroup tag) still persists — compare must degrade, never fabricate.
    const { module } = composeConductor({ substrates: [] });
    const created = await module.createWorkspace(
      makeCreateInput({ runtimeId: 'claude_code', command: 'agent-run', metadata: { taskGroup: 'grp_fail' } }),
      makePrincipal(),
    );
    expect(created.value?.state).toBe('failed');

    const compare = await module.compareTaskGroup('grp_fail');

    expect(compare.count).toBe(1);
    const sib = compare.siblings[0];
    expect(sib.diffStat).toBeUndefined();
    expect(sib.diffStatReason).toContain('no worktree');
  });
});

describe('compare service pure helpers', () => {
  it('parseDiffStat reads insertions/deletions from a --stat summary line', () => {
    expect(parseDiffStat(' 3 files changed, 45 insertions(+), 12 deletions(-)', 3)).toEqual({
      files: 3,
      additions: 45,
      deletions: 12,
    });
  });

  it('parseDiffStat defaults missing insertion/deletion clauses to 0', () => {
    expect(parseDiffStat(' 1 file changed, 2 insertions(+)', 1)).toEqual({
      files: 1,
      additions: 2,
      deletions: 0,
    });
    expect(parseDiffStat(' 1 file changed, 4 deletions(-)', 1)).toEqual({
      files: 1,
      additions: 0,
      deletions: 4,
    });
    expect(parseDiffStat('', 0)).toEqual({ files: 0, additions: 0, deletions: 0 });
  });

  it('taskGroupOf reads a non-blank metadata.taskGroup, else undefined', () => {
    const base = {
      workspaceId: 'w',
      spaceId: 's',
      projectId: 'p',
      taskId: 't',
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree' as const,
      branch: 'b',
      baseRef: 'HEAD',
      state: 'running' as const,
      createdBy: 'u',
      createdAt: 'now',
      updatedAt: 'now',
    };
    expect(taskGroupOf({ ...base, metadata: { taskGroup: 'grp_1' } })).toBe('grp_1');
    expect(taskGroupOf({ ...base, metadata: { taskGroup: '  ' } })).toBeUndefined();
    expect(taskGroupOf({ ...base, metadata: {} })).toBeUndefined();
    expect(taskGroupOf(base)).toBeUndefined();
  });
});
