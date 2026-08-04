/**
 * Convergence plan (product step 2) — the pure fold of N sibling diffs + a
 * per-contested-file selection into a resolved file→source map.
 *
 * Proves: a non-contested path (one author) auto-resolves to that author; a
 * contested path (2+ authors) resolves ONLY to a valid selection (a real author),
 * else it is unresolved with the truthful reason (`no-selection` /
 * `invalid-selection`); a sibling whose changed-file list is unreadable contributes
 * NO authorship; the fold is order-independent and deterministic; `sources` tallies
 * each winner's file count joined to its agent; `complete` requires ≥1 winning file
 * and zero unresolved.
 */
import { describe, it, expect } from 'vitest';
import {
  planConvergence,
  ASSISTED_SELECTION,
  SYNTHESIZE_SELECTION,
  type ContestedProbe,
  type ConvergencePlan,
  type ConvergencePlanInput,
  type ConvergencePlanSiblingInput,
} from './converge-plan.service.js';

function sibling(
  workspaceId: string,
  changedFiles: readonly string[] | undefined,
  agent = 'claude_code',
): ConvergencePlanSiblingInput {
  return { workspaceId, agent, ...(changedFiles ? { changedFiles } : {}) };
}

function input(over: Partial<ConvergencePlanInput> = {}): ConvergencePlanInput {
  return {
    taskGroup: 'grp-1',
    siblings: [
      sibling('ws-a', ['src/a.ts', 'src/shared.ts']),
      sibling('ws-b', ['src/b.ts', 'src/shared.ts']),
    ],
    selection: {},
    ...over,
  };
}

describe('planConvergence', () => {
  it('auto-resolves non-contested paths to their sole author', () => {
    const plan = planConvergence(
      input({
        siblings: [sibling('ws-a', ['src/a.ts']), sibling('ws-b', ['src/b.ts'])],
        selection: {},
      }),
    );
    expect(plan.unresolved).toEqual([]);
    expect(plan.complete).toBe(true);
    expect(plan.files.map((f) => [f.path, f.sourceWorkspaceId, f.contested])).toEqual([
      ['src/a.ts', 'ws-a', false],
      ['src/b.ts', 'ws-b', false],
    ]);
    expect(plan.changedFiles).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('resolves a contested path to a VALID pick selection (a real author)', () => {
    const plan = planConvergence(input({ selection: { 'src/shared.ts': 'ws-b' } }));
    const shared = plan.files.find((f) => f.path === 'src/shared.ts');
    expect(shared).toEqual({
      path: 'src/shared.ts',
      mode: 'pick',
      sourceWorkspaceId: 'ws-b',
      contested: true,
      candidates: ['ws-a', 'ws-b'],
    });
    expect(plan.unresolved).toEqual([]);
    expect(plan.complete).toBe(true);
  });

  it('resolves a contested path to SYNTHESIZE (optimistic) when the sentinel is selected', () => {
    const plan = planConvergence(input({ selection: { 'src/shared.ts': SYNTHESIZE_SELECTION } }));
    const shared = plan.files.find((f) => f.path === 'src/shared.ts');
    expect(shared).toEqual({
      path: 'src/shared.ts',
      mode: 'synthesize',
      contributors: ['ws-a', 'ws-b'],
      contested: true,
      candidates: ['ws-a', 'ws-b'],
    });
    expect(shared?.sourceWorkspaceId).toBeUndefined();
    // The pure fold is OPTIMISTIC — it does no git; the ops layer proves cleanliness.
    expect(plan.complete).toBe(true);
  });

  it('resolves a contested path to ASSISTED (optimistic) when the assisted sentinel is selected', () => {
    const plan = planConvergence(input({ selection: { 'src/shared.ts': ASSISTED_SELECTION } }));
    const shared = plan.files.find((f) => f.path === 'src/shared.ts');
    expect(shared).toEqual({
      path: 'src/shared.ts',
      mode: 'assisted',
      contributors: ['ws-a', 'ws-b'],
      contested: true,
      candidates: ['ws-a', 'ws-b'],
    });
    expect(shared?.sourceWorkspaceId).toBeUndefined();
    // Same optimism as synthesize — the ops layer proves cleanliness (LLM incl.).
    expect(plan.complete).toBe(true);
    // The PURE fold never records an assisted result — that is compose's job.
    expect(plan.assisted).toBeUndefined();
  });

  it('an assisted file tallies EVERY contributor in sources (like synthesize)', () => {
    const plan = planConvergence(input({ selection: { 'src/shared.ts': ASSISTED_SELECTION } }));
    expect(plan.sources).toEqual([
      { workspaceId: 'ws-a', agent: 'claude_code', fileCount: 2 }, // a.ts + shared.ts
      { workspaceId: 'ws-b', agent: 'claude_code', fileCount: 2 }, // b.ts + shared.ts
    ]);
  });

  it('non-contested paths are always pick (the sentinel only applies to contested)', () => {
    const plan = planConvergence(
      input({
        siblings: [sibling('ws-a', ['a.ts']), sibling('ws-b', ['b.ts'])],
        selection: { 'a.ts': SYNTHESIZE_SELECTION },
      }),
    );
    expect(plan.files.every((f) => f.mode === 'pick')).toBe(true);
  });

  it('the PURE fold never sets `contested` — the synthesizability probe is an ops-layer add-on', () => {
    expect(planConvergence(input()).contested).toBeUndefined();
    expect(
      planConvergence(input({ selection: { 'src/shared.ts': SYNTHESIZE_SELECTION } })).contested,
    ).toBeUndefined();
  });

  it('a probed plan carries the probe conflict REGIONS through the spread (additive)', () => {
    const plan = planConvergence(input());
    const probe: ContestedProbe = {
      path: 'src/shared.ts',
      workspaceIds: ['ws-a', 'ws-b'],
      synthesizable: false,
      reason: 'overlap',
      regions: [{ startLine: 3, endLine: 7, ours: ['l3-A'], theirs: ['l3-B'], truncated: false }],
    };
    // The ops layer attaches probes exactly like this (`{...plan, contested}`) —
    // the regions must survive verbatim, and the unprobed source plan stays bare.
    const probed: ConvergencePlan = { ...plan, contested: [probe] };
    expect(probed.contested?.[0].regions).toEqual([
      { startLine: 3, endLine: 7, ours: ['l3-A'], theirs: ['l3-B'], truncated: false },
    ]);
    expect(plan.contested).toBeUndefined();
  });

  it('flags a contested path with NO selection as unresolved (no-selection)', () => {
    const plan = planConvergence(input({ selection: {} }));
    expect(plan.complete).toBe(false);
    expect(plan.unresolved).toEqual([
      { path: 'src/shared.ts', candidates: ['ws-a', 'ws-b'], reason: 'no-selection' },
    ]);
    // The non-contested paths STILL resolve (partial plan is truthful).
    expect(plan.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('rejects a selection naming a NON-author (invalid-selection)', () => {
    const plan = planConvergence(input({ selection: { 'src/shared.ts': 'ws-zzz' } }));
    expect(plan.complete).toBe(false);
    expect(plan.unresolved).toEqual([
      { path: 'src/shared.ts', candidates: ['ws-a', 'ws-b'], reason: 'invalid-selection' },
    ]);
  });

  it('is order-independent over sibling order and changed-file order', () => {
    const a = planConvergence(
      input({
        siblings: [
          sibling('ws-a', ['src/shared.ts', 'src/a.ts']),
          sibling('ws-b', ['src/shared.ts', 'src/b.ts']),
        ],
        selection: { 'src/shared.ts': 'ws-a' },
      }),
    );
    const b = planConvergence(
      input({
        siblings: [
          sibling('ws-b', ['src/b.ts', 'src/shared.ts']),
          sibling('ws-a', ['src/a.ts', 'src/shared.ts']),
        ],
        selection: { 'src/shared.ts': 'ws-a' },
      }),
    );
    expect(a).toEqual(b);
  });

  it('degrade: a sibling with an unreadable changed-file list contributes no authorship', () => {
    const plan = planConvergence(
      input({
        siblings: [
          sibling('ws-a', ['src/a.ts', 'src/shared.ts']),
          sibling('ws-b', undefined), // unreadable — contributes nothing
        ],
        selection: {},
      }),
    );
    // src/shared.ts now has ONE author (ws-a) → non-contested, auto-resolved.
    expect(plan.complete).toBe(true);
    expect(plan.unresolved).toEqual([]);
    const shared = plan.files.find((f) => f.path === 'src/shared.ts');
    expect(shared?.contested).toBe(false);
    expect(shared?.sourceWorkspaceId).toBe('ws-a');
  });

  it('tallies per-source contributions joined to the agent, sorted by workspaceId', () => {
    const plan = planConvergence(
      input({
        siblings: [
          sibling('ws-a', ['src/a.ts', 'src/shared.ts'], 'claude_code'),
          sibling('ws-b', ['src/b.ts', 'src/shared.ts'], 'codex'),
        ],
        selection: { 'src/shared.ts': 'ws-a' },
      }),
    );
    expect(plan.sources).toEqual([
      { workspaceId: 'ws-a', agent: 'claude_code', fileCount: 2 }, // a.ts + shared.ts
      { workspaceId: 'ws-b', agent: 'codex', fileCount: 1 }, // b.ts
    ]);
  });

  it('an empty group is a truthful empty plan (not complete)', () => {
    const plan = planConvergence({ taskGroup: null, siblings: [], selection: {} });
    expect(plan).toMatchObject({
      taskGroup: null,
      siblingCount: 0,
      files: [],
      unresolved: [],
      sources: [],
      changedFiles: [],
      complete: false,
    });
  });

  it('mixed: resolves non-contested + a selected contested in one complete plan', () => {
    const plan = planConvergence(
      input({
        siblings: [
          sibling('ws-a', ['a.ts', 'shared.ts', 'both.ts']),
          sibling('ws-b', ['b.ts', 'shared.ts', 'both.ts']),
        ],
        selection: { 'shared.ts': 'ws-a', 'both.ts': 'ws-b' },
      }),
    );
    expect(plan.complete).toBe(true);
    expect(plan.files.map((f) => [f.path, f.sourceWorkspaceId, f.contested])).toEqual([
      ['a.ts', 'ws-a', false],
      ['b.ts', 'ws-b', false],
      ['both.ts', 'ws-b', true],
      ['shared.ts', 'ws-a', true],
    ]);
  });
});
