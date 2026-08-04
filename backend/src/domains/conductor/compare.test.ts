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
import type { Workspace } from '@recoder/agent-os';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from './__fixtures__/harness.js';
import {
  compareTaskGroup as compareTaskGroupOp,
  compareWorkspaces as compareWorkspacesOp,
  adHocGroupId,
  computeContested,
  parseDiffStat,
  taskGroupOf,
  type CompareDeps,
  type SiblingCompareEntry,
} from './services/compare.service.js';

/** A fake `Workspace` record tagged into `taskGroup` — the population the op groups over. */
function fakeWorkspace(workspaceId: string, taskGroup: string, createdAt: string): Workspace {
  return {
    workspaceId,
    spaceId: 's',
    projectId: 'p',
    taskId: 't',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'b',
    baseRef: 'HEAD',
    state: 'running',
    createdBy: 'u',
    createdAt,
    updatedAt: createdAt,
    metadata: { taskGroup },
  } as unknown as Workspace;
}

/**
 * A pure, injected {@link CompareDeps} that serves each workspace's changed-file
 * list from `changed`. `buildView` throws (the compare service catches it → no
 * attention) and `diffStat` is irrelevant here — this isolates the overlap logic.
 */
function fakeCompareDeps(
  workspaces: readonly Workspace[],
  changed: Record<string, { files?: readonly string[]; reason?: string }>,
): CompareDeps {
  return {
    listWorkspaces: async () => [...workspaces],
    getWorkspace: async (id) => workspaces.find((w) => w.workspaceId === id) ?? null,
    buildView: async () => {
      throw new Error('no view in this pure overlap test');
    },
    diffStat: async () => ({ reason: 'diffStat not exercised in this test' }),
    changedFiles: async (ws) => changed[ws.workspaceId] ?? { reason: 'unset' },
  };
}

/** A minimal {@link SiblingCompareEntry} for direct {@link computeContested} tests. */
function fakeEntry(workspaceId: string, changedFiles?: readonly string[]): SiblingCompareEntry {
  return {
    workspaceId,
    agent: 'claude_code',
    runtimeId: 'claude_code',
    branch: 'b',
    state: 'running',
    createdAt: 'now',
    updatedAt: 'now',
    ...(changedFiles ? { changedFiles } : {}),
  };
}

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

  it('composed 3-sibling group degrades contested to [] with changedFilesReason when worktrees are not real repos', async () => {
    // The FakeSubstrate worktree (`/tmp/fake/<ref>`) is NOT a real git repo, so the
    // reused per-file diff read degrades every sibling to a truthful reason — the
    // contested overlap must be `[]` (never a fabricated collision), end to end.
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    await launchSibling(module, 'grp_contest', 'claude_code');
    await launchSibling(module, 'grp_contest', 'codex');
    await launchSibling(module, 'grp_contest', 'opencode');

    const compare = await module.compareTaskGroup('grp_contest');

    expect(compare.count).toBe(3);
    expect(compare.contested).toEqual([]);
    for (const sib of compare.siblings) {
      expect(sib.changedFiles).toBeUndefined();
      expect(sib.changedFilesReason).toBeDefined();
    }
  });
});

describe('compare contested-file overlap', () => {
  const wsA = fakeWorkspace('A', 'grp', '2026-01-01T00:00:00Z');
  const wsB = fakeWorkspace('B', 'grp', '2026-01-01T00:00:01Z');
  const wsC = fakeWorkspace('C', 'grp', '2026-01-01T00:00:02Z');
  const members = [wsA, wsB, wsC];

  it('0-overlap across 3 siblings ⇒ contested []', async () => {
    const deps = fakeCompareDeps(members, {
      A: { files: ['a.ts'] },
      B: { files: ['b.ts'] },
      C: { files: ['c.ts'] },
    });
    const view = await compareTaskGroupOp(deps, 'grp');
    expect(view.contested).toEqual([]);
  });

  it('pairwise overlap ⇒ one contested file with the 2 workspaceIds', async () => {
    const deps = fakeCompareDeps(members, {
      A: { files: ['a.ts', 'shared.ts'] },
      B: { files: ['shared.ts', 'b.ts'] },
      C: { files: ['c.ts'] },
    });
    const view = await compareTaskGroupOp(deps, 'grp');
    expect(view.contested).toEqual([{ path: 'shared.ts', workspaceIds: ['A', 'B'] }]);
  });

  it('all-three overlap ⇒ one contested file with all 3 workspaceIds', async () => {
    const deps = fakeCompareDeps(members, {
      A: { files: ['x.ts'] },
      B: { files: ['x.ts'] },
      C: { files: ['x.ts'] },
    });
    const view = await compareTaskGroupOp(deps, 'grp');
    expect(view.contested).toEqual([{ path: 'x.ts', workspaceIds: ['A', 'B', 'C'] }]);
  });

  it('per-sibling changedFiles projected onto each entry', async () => {
    const deps = fakeCompareDeps(members, {
      A: { files: ['a.ts', 'shared.ts'] },
      B: { files: ['shared.ts', 'b.ts'] },
      C: { files: ['c.ts'] },
    });
    const view = await compareTaskGroupOp(deps, 'grp');
    const byId = Object.fromEntries(view.siblings.map((s) => [s.workspaceId, s.changedFiles]));
    expect(byId.A).toEqual(['a.ts', 'shared.ts']);
    expect(byId.B).toEqual(['shared.ts', 'b.ts']);
    expect(byId.C).toEqual(['c.ts']);
  });

  it('degrade: an unreadable sibling contributes nothing (changedFilesReason set, no fabricated overlap)', async () => {
    const deps = fakeCompareDeps(members, {
      A: { files: ['shared.ts'] },
      B: { reason: 'no worktree (never launched or already torn down)' },
      C: { files: ['shared.ts'] },
    });
    const view = await compareTaskGroupOp(deps, 'grp');
    // Overlap is over the READABLE siblings only — never fabricated for B.
    expect(view.contested).toEqual([{ path: 'shared.ts', workspaceIds: ['A', 'C'] }]);
    const b = view.siblings.find((s) => s.workspaceId === 'B')!;
    expect(b.changedFiles).toBeUndefined();
    expect(b.changedFilesReason).toContain('no worktree');
  });
});

describe('compare service pure helpers', () => {
  it('computeContested: empty input and entries lacking changedFiles ⇒ []', () => {
    expect(computeContested([])).toEqual([]);
    // Entries with no changedFiles (unreadable) never contest, even on the same path.
    expect(computeContested([fakeEntry('A'), fakeEntry('B')])).toEqual([]);
    // A readable sibling + an unreadable one on the same path ⇒ still no overlap.
    expect(computeContested([fakeEntry('A', ['shared.ts']), fakeEntry('B')])).toEqual([]);
  });

  it('computeContested: 0/pairwise/all-three overlap', () => {
    expect(
      computeContested([
        fakeEntry('A', ['a.ts']),
        fakeEntry('B', ['b.ts']),
        fakeEntry('C', ['c.ts']),
      ]),
    ).toEqual([]);
    expect(
      computeContested([
        fakeEntry('A', ['a.ts', 'shared.ts']),
        fakeEntry('B', ['shared.ts', 'b.ts']),
      ]),
    ).toEqual([{ path: 'shared.ts', workspaceIds: ['A', 'B'] }]);
    expect(
      computeContested([
        fakeEntry('A', ['x.ts']),
        fakeEntry('B', ['x.ts']),
        fakeEntry('C', ['x.ts']),
      ]),
    ).toEqual([{ path: 'x.ts', workspaceIds: ['A', 'B', 'C'] }]);
  });

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

/**
 * AD-HOC compare (PW1 #1) — the PURE `compareWorkspaces` op that forms a converge
 * group from an EXPLICIT id list (workspaces launched SEPARATELY, not F3 siblings).
 * These isolate the fail-closed validation without git: too-few / no-oracle
 * not-found / different-repo incompatible / the happy path over an explicit set.
 */
describe('compareWorkspaces (ad-hoc, explicit id set)', () => {
  /** A record with overridable repo/owner fields + a changed-file list. */
  function ws(
    workspaceId: string,
    over: Partial<Pick<Workspace, 'spaceId' | 'projectId' | 'createdBy' | 'createdAt'>> = {},
  ): Workspace {
    return {
      workspaceId,
      spaceId: over.spaceId ?? 's',
      projectId: over.projectId ?? 'p',
      taskId: 't',
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      branch: 'b',
      baseRef: 'HEAD',
      state: 'awaiting_review',
      createdBy: over.createdBy ?? 'owner',
      createdAt: over.createdAt ?? 'now',
      updatedAt: over.createdAt ?? 'now',
      metadata: {},
    } as unknown as Workspace;
  }

  /** Deps that serve the given records + changed files, narrowed to `owner`-created ones. */
  function deps(
    records: readonly Workspace[],
    changed: Record<string, readonly string[]> = {},
  ): CompareDeps {
    return {
      listWorkspaces: async () => [...records],
      getWorkspace: async (id) => records.find((r) => r.workspaceId === id) ?? null,
      buildView: async () => {
        throw new Error('no view in this pure test');
      },
      diffStat: async () => ({ reason: 'not exercised' }),
      changedFiles: async (w) =>
        changed[w.workspaceId] ? { files: changed[w.workspaceId] } : { reason: 'unset' },
      // recoder-kybr: only `owner`'s records are accessible to the caller.
      canAccess: (w) => w.createdBy === 'owner',
    };
  }

  it('aggregates an explicit 2-workspace set + the contested overlap (synthetic group id)', async () => {
    const records = [ws('ws_a'), ws('ws_b')];
    const outcome = await compareWorkspacesOp(
      deps(records, { ws_a: ['a.ts', 'shared.ts'], ws_b: ['b.ts', 'shared.ts'] }),
      ['ws_b', 'ws_a'], // order-independent
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.view.count).toBe(2);
    // The synthetic id is deterministic in the SET, not the call order.
    expect(outcome.view.taskGroup).toBe(adHocGroupId(['ws_a', 'ws_b']));
    expect(outcome.view.contested.map((c) => c.path)).toEqual(['shared.ts']);
    expect([...outcome.view.contested[0]!.workspaceIds].sort()).toEqual(['ws_a', 'ws_b']);
  });

  it('too-few: <2 distinct ids (incl. duplicates) ⇒ code:too-few', async () => {
    const records = [ws('ws_a')];
    expect(await compareWorkspacesOp(deps(records), ['ws_a'])).toMatchObject({
      ok: false,
      code: 'too-few',
    });
    expect(await compareWorkspacesOp(deps(records), ['ws_a', 'ws_a', '  '])).toMatchObject({
      ok: false,
      code: 'too-few',
    });
  });

  it('not-found: a missing OR unowned id fails the WHOLE call (no-oracle)', async () => {
    const mine = ws('ws_mine');
    const theirs = ws('ws_theirs', { createdBy: 'someone_else' });
    // A genuinely missing id.
    expect(
      await compareWorkspacesOp(deps([mine]), ['ws_mine', 'ws_ghost']),
    ).toEqual({ ok: false, code: 'not-found' });
    // An id the caller does not own is byte-identical (never confirms it exists).
    expect(
      await compareWorkspacesOp(deps([mine, theirs]), ['ws_mine', 'ws_theirs']),
    ).toEqual({ ok: false, code: 'not-found' });
  });

  it('ownership is checked BEFORE repo-compat (a foreign id never leaks repo info)', async () => {
    // ws_theirs is BOTH unowned AND a different repo — the result must be the
    // no-oracle not-found, never the repo-revealing `incompatible`.
    const mine = ws('ws_mine', { projectId: 'p1' });
    const theirs = ws('ws_theirs', { projectId: 'p2', createdBy: 'someone_else' });
    expect(
      await compareWorkspacesOp(deps([mine, theirs]), ['ws_mine', 'ws_theirs']),
    ).toEqual({ ok: false, code: 'not-found' });
  });

  it('incompatible: owned workspaces from different repos ⇒ code:incompatible + truthful reason', async () => {
    const a = ws('ws_a', { projectId: 'proj_1' });
    const b = ws('ws_b', { projectId: 'proj_2' });
    const outcome = await compareWorkspacesOp(deps([a, b]), ['ws_a', 'ws_b']);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('incompatible');
    expect((outcome as { reason: string }).reason).toMatch(/different repos/i);
  });

  it('incompatible: different space (tenant) is also rejected', async () => {
    const a = ws('ws_a', { spaceId: 'space_1' });
    const b = ws('ws_b', { spaceId: 'space_2' });
    expect(await compareWorkspacesOp(deps([a, b]), ['ws_a', 'ws_b'])).toMatchObject({
      ok: false,
      code: 'incompatible',
    });
  });
});
