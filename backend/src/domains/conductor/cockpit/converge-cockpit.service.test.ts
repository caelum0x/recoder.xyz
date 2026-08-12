/**
 * `ConvergeCockpitService` unit tests — the pure fold against INJECTED fakes (no real
 * Loom daemon, git, or gate). Proves the truthfulness invariants: settle counting,
 * the contested partition, cleanCount, convergeReady, the fileVersions projection,
 * the degraded snapshot, and the summary line.
 */
import { describe, it, expect } from 'vitest';
import {
  ConvergeCockpitService,
  type CockpitPaneInput,
  type CockpitPanesResult,
  type ConvergeCockpitDeps,
} from './converge-cockpit.service.js';
import type {
  ConvergencePlan,
  ContestedProbe,
} from '../converge/converge-plan.service.js';
import type { FileVersionsView } from '../converge/converge.ops.js';
import type { AttentionState } from '../types.js';

// --- fixtures ----------------------------------------------------------------

function pane(
  workspaceId: string,
  agent: string,
  state: AttentionState
): CockpitPaneInput {
  return { workspaceId, agent, state };
}

function planFixture(
  overrides: Partial<ConvergencePlan> = {}
): ConvergencePlan {
  return {
    taskGroup: 'grp',
    siblingCount: 2,
    files: [],
    unresolved: [],
    sources: [],
    changedFiles: [],
    complete: false,
    contested: [],
    ...overrides,
  };
}

function probe(
  path: string,
  workspaceIds: readonly string[],
  synthesizable: boolean,
  reason?: string
): ContestedProbe {
  return {
    path,
    workspaceIds,
    synthesizable,
    ...(reason ? { reason } : {}),
  };
}

interface BuildOpts {
  panes: CockpitPanesResult | (() => Promise<CockpitPanesResult>);
  plan?: ConvergencePlan | (() => Promise<ConvergencePlan>);
  fileVersions?:
    | readonly FileVersionsView[]
    | ((paths: readonly string[]) => Promise<readonly FileVersionsView[]>);
}

/** Build a service over deterministic fakes; records the paths fileVersions saw. */
function build(opts: BuildOpts): {
  service: ConvergeCockpitService;
  fileVersionCalls: string[][];
} {
  const fileVersionCalls: string[][] = [];
  const deps: ConvergeCockpitDeps = {
    loadPanes: async () =>
      typeof opts.panes === 'function' ? opts.panes() : opts.panes,
    plan: async () => {
      const p = opts.plan ?? planFixture();
      return typeof p === 'function' ? p() : p;
    },
    fileVersions: async paths => {
      fileVersionCalls.push([...paths]);
      const fv = opts.fileVersions ?? [];
      return typeof fv === 'function' ? fv(paths) : fv;
    },
  };
  return { service: new ConvergeCockpitService(deps), fileVersionCalls };
}

// --- tests -------------------------------------------------------------------

describe('ConvergeCockpitService.snapshot', () => {
  it('counts only settle-set states as settled (working/unknown excluded)', async () => {
    const { service } = build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'codex', 'awaiting_approval'),
          pane('ws_3', 'cursor', 'working'),
          pane('ws_4', 'pi', 'unknown'),
        ],
      },
      plan: planFixture({ changedFiles: ['a.ts'] }),
    });

    const snap = await service.snapshot();

    expect(snap.totalCount).toBe(4);
    expect(snap.settledCount).toBe(2); // review_ready + awaiting_approval only
    const byId = Object.fromEntries(snap.agents.map(a => [a.workspaceId, a]));
    expect(byId.ws_1.settled).toBe(true);
    expect(byId.ws_2.settled).toBe(true);
    expect(byId.ws_3.settled).toBe(false); // working
    expect(byId.ws_4.settled).toBe(false); // unknown
  });

  it('counts error as settled but NOT done-ish — it never lights convergeReady', async () => {
    const { service } = build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'codex', 'error'),
        ],
      },
      plan: planFixture({ changedFiles: ['a.ts'] }),
    });

    const snap = await service.snapshot();
    // error IS in the settle set (the pane stopped) → counted settled …
    expect(snap.settledCount).toBe(2);
    const byId = Object.fromEntries(snap.agents.map(a => [a.workspaceId, a]));
    expect(byId.ws_2.settled).toBe(true);
    // … but a failed pane has no trustworthy diff → NOT done-ish → not converge-ready.
    expect(snap.convergeReady).toBe(false);
  });

  it('reports native vs raw-pane fallback truthfully', async () => {
    const { service } = build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'recoder_code', 'review_ready'),
        ],
      },
      plan: planFixture({ changedFiles: ['a.ts'] }),
    });

    const snap = await service.snapshot();
    const byId = Object.fromEntries(snap.agents.map(a => [a.workspaceId, a]));
    expect(byId.ws_1.nativeStatus).toBe(true);
    expect(byId.ws_2.nativeStatus).toBe(false);
  });

  it('partitions contested exactly into auto-mergeable + needs-a-pick', async () => {
    const { service } = build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'codex', 'review_ready'),
        ],
      },
      plan: planFixture({
        changedFiles: ['x.ts', 'y.ts', 'z.ts'],
        contested: [
          probe('x.ts', ['ws_1', 'ws_2'], true),
          probe('y.ts', ['ws_1', 'ws_2'], true),
          probe('z.ts', ['ws_1', 'ws_2'], false, 'overlap'),
        ],
      }),
    });

    const snap = await service.snapshot();
    expect(snap.contested).toHaveLength(3);
    expect(snap.autoMergeableCount).toBe(2);
    expect(snap.needsPickCount).toBe(1);
    // Exact partition: the two counts sum to the contested total, no double count.
    expect(snap.autoMergeableCount + snap.needsPickCount).toBe(
      snap.contested.length
    );
    // The reason flows through only for the non-synthesizable file.
    const z = snap.contested.find(c => c.path === 'z.ts');
    expect(z?.reason).toBe('overlap');
    expect(z?.agents).toEqual(['ws_1', 'ws_2']);
  });

  it('derives cleanCount from non-contested changed files', async () => {
    const { service } = build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'codex', 'review_ready'),
        ],
      },
      plan: planFixture({
        changedFiles: ['a.ts', 'b.ts', 'c.ts', 'shared.ts'],
        contested: [probe('shared.ts', ['ws_1', 'ws_2'], true)],
      }),
    });

    const snap = await service.snapshot();
    // 4 changed - 1 contested = 3 clean (single-author) files.
    expect(snap.cleanCount).toBe(3);
  });

  it('sets convergeReady true only when ALL panes settled AND the plan is usable', async () => {
    const settledPanes: CockpitPanesResult = {
      taskGroup: 'grp',
      panes: [
        pane('ws_1', 'claude', 'review_ready'),
        pane('ws_2', 'codex', 'agent_idle_prompt'),
      ],
    };

    // All settled + a usable plan (≥1 changed file) → ready.
    const ready = await build({
      panes: settledPanes,
      plan: planFixture({ changedFiles: ['a.ts'] }),
    }).service.snapshot();
    expect(ready.convergeReady).toBe(true);

    // A usable plan but one pane still working → NOT ready.
    const oneWorking = await build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'codex', 'working'),
        ],
      },
      plan: planFixture({ changedFiles: ['a.ts'] }),
    }).service.snapshot();
    expect(oneWorking.convergeReady).toBe(false);

    // All settled but nothing to converge (no changed files) → NOT ready.
    const emptyPlan = await build({
      panes: settledPanes,
      plan: planFixture({ changedFiles: [] }),
    }).service.snapshot();
    expect(emptyPlan.convergeReady).toBe(false);
  });

  it('projects the N-up fileVersions for the contested paths', async () => {
    const versions: FileVersionsView[] = [
      {
        path: 'shared.ts',
        base: 'base-content',
        versions: [
          { workspaceId: 'ws_1', agent: 'claude', content: 'v1' },
          { workspaceId: 'ws_2', agent: 'codex', content: 'v2' },
        ],
      },
    ];
    const { service, fileVersionCalls } = build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'codex', 'review_ready'),
        ],
      },
      plan: planFixture({
        changedFiles: ['shared.ts'],
        contested: [probe('shared.ts', ['ws_1', 'ws_2'], false, 'overlap')],
      }),
      fileVersions: versions,
    });

    const snap = await service.snapshot();
    expect(snap.fileVersions).toEqual(versions);
    // Gathered ONLY for the contested paths (sorted), never the whole changed set.
    expect(fileVersionCalls).toEqual([['shared.ts']]);
  });

  it('does not gather fileVersions when nothing is contested', async () => {
    const { service, fileVersionCalls } = build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'codex', 'review_ready'),
        ],
      },
      plan: planFixture({ changedFiles: ['a.ts', 'b.ts'], contested: [] }),
    });

    const snap = await service.snapshot();
    expect(snap.fileVersions).toEqual([]);
    expect(fileVersionCalls).toEqual([]);
  });

  it('renders the terminal-plain summary line', async () => {
    const { service } = build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'codex', 'review_ready'),
          pane('ws_3', 'cursor', 'awaiting_approval'),
          pane('ws_4', 'pi', 'working'),
        ],
      },
      plan: planFixture({
        changedFiles: ['x.ts', 'y.ts'],
        contested: [
          probe('x.ts', ['ws_1', 'ws_2'], true),
          probe('y.ts', ['ws_1', 'ws_2'], false, 'overlap'),
        ],
      }),
    });

    const snap = await service.snapshot();
    expect(snap.summaryLine).toBe(
      '3/4 settled · 2 files contested · 1 auto-mergeable · 1 needs a pick'
    );
  });

  it('uses the singular noun when exactly one file is contested', async () => {
    const { service } = build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'codex', 'review_ready'),
        ],
      },
      plan: planFixture({
        changedFiles: ['x.ts'],
        contested: [probe('x.ts', ['ws_1', 'ws_2'], true)],
      }),
    });

    const snap = await service.snapshot();
    expect(snap.summaryLine).toBe(
      '2/2 settled · 1 file contested · 1 auto-mergeable · 0 needs a pick'
    );
  });

  it('degrades truthfully (zeros + reason) when the probe faults — no fabricated numbers', async () => {
    const { service, fileVersionCalls } = build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'codex', 'working'),
        ],
      },
      plan: () => Promise.reject(new Error('repo gone')),
    });

    const snap = await service.snapshot();
    expect(snap.degraded).toBe(true);
    expect(snap.reason).toContain('repo gone');
    // Panes + settle counts stay REAL; every convergence number is a hard zero.
    expect(snap.totalCount).toBe(2);
    expect(snap.settledCount).toBe(1);
    expect(snap.contested).toEqual([]);
    expect(snap.autoMergeableCount).toBe(0);
    expect(snap.needsPickCount).toBe(0);
    expect(snap.cleanCount).toBe(0);
    expect(snap.fileVersions).toEqual([]);
    expect(snap.convergeReady).toBe(false);
    // Never probed the columns on a degrade.
    expect(fileVersionCalls).toEqual([]);
    expect(snap.summaryLine).toBe(
      '1/2 settled · convergence unavailable (convergence probe failed: repo gone)'
    );
  });

  it('degrades on too-few panes without ever probing', async () => {
    const { service } = build({
      panes: {
        taskGroup: 'grp',
        panes: [pane('ws_1', 'claude', 'review_ready')],
      },
      plan: () => Promise.reject(new Error('should never be called')),
    });

    const snap = await service.snapshot();
    expect(snap.degraded).toBe(true);
    expect(snap.reason).toContain('needs ≥2 panes');
    expect(snap.totalCount).toBe(1);
    expect(snap.settledCount).toBe(1);
    expect(snap.convergeReady).toBe(false);
  });

  it('degrades when the sibling read itself faults (agents empty)', async () => {
    const { service } = build({
      panes: () => Promise.reject(new Error('compare unavailable')),
    });

    const snap = await service.snapshot();
    expect(snap.degraded).toBe(true);
    expect(snap.reason).toContain('compare unavailable');
    expect(snap.agents).toEqual([]);
    expect(snap.totalCount).toBe(0);
    expect(snap.taskGroup).toBeNull();
  });

  it('keeps the snapshot when only the fileVersions column read faults (numbers intact)', async () => {
    const { service } = build({
      panes: {
        taskGroup: 'grp',
        panes: [
          pane('ws_1', 'claude', 'review_ready'),
          pane('ws_2', 'codex', 'review_ready'),
        ],
      },
      plan: planFixture({
        changedFiles: ['shared.ts'],
        contested: [probe('shared.ts', ['ws_1', 'ws_2'], true)],
      }),
      fileVersions: () => Promise.reject(new Error('worktree torn down')),
    });

    const snap = await service.snapshot();
    // The column read is best-effort: empty columns, but the probe numbers stand.
    expect(snap.degraded).toBe(false);
    expect(snap.fileVersions).toEqual([]);
    expect(snap.autoMergeableCount).toBe(1);
    expect(snap.contested).toHaveLength(1);
  });
});
