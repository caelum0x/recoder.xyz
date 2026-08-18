/**
 * ReadinessService tests — the PURE fold matrix + the composer allSettled
 * degrade proof. These assert the truthful laws the read-model enforces:
 *
 *  - `'ready'` is returned ONLY on a real `available && clean` merge pass;
 *  - an unknown merge gate with no hard blocker ⇒ `'unknown'`, never `'ready'`;
 *  - a degraded preview proves NOTHING ⇒ an `'unknown'` signal (not pass/fail);
 *  - a faulting/hung probe degrades to an ABSENT input (Promise.allSettled), so
 *    the edge never 500s and the signal reports `'unknown'`.
 */
import { describe, it, expect } from 'vitest';
import type { WorkspaceState } from '@recoder/agent-os';
import { foldReadiness, type ReadinessInput } from './readiness.service.js';
import type { MergeabilityView } from './mergeability.service.js';
import type { PrStatusView } from './pr-status.service.js';
import type { WorktreeStatusView } from './worktree-status.service.js';
import type { PreviewVerificationView } from '../ports/preview-verify.port.js';
import type { PrReviewEvidenceView } from '../ports/pr-review.port.js';
import {
  composeConductor,
  makeCreateInput,
  makePrincipal,
  FakeSubstrate,
} from '../__fixtures__/harness.js';

// --- pure view builders (truthful shapes the real probes emit) ----------------

function cleanMerge(overrides: Partial<MergeabilityView> = {}): MergeabilityView {
  return {
    available: true,
    verdict: 'clean',
    conflicts: [],
    ahead: 1,
    behind: 0,
    base: 'main',
    branch: 'feat/x',
    ...overrides,
  };
}

function conflictingMerge(conflicts: readonly string[]): MergeabilityView {
  return {
    available: true,
    verdict: 'conflicting',
    conflicts,
    ahead: 1,
    behind: 2,
    base: 'main',
    branch: 'feat/x',
  };
}

/** git-too-old / no-worktree ⇒ available:false, verdict 'unknown'. */
function unknownMerge(reason: string): MergeabilityView {
  return {
    available: false,
    verdict: 'unknown',
    conflicts: [],
    ahead: 0,
    behind: 0,
    base: 'main',
    branch: 'feat/x',
    reason,
  };
}

function failingChecks(): PrStatusView {
  return {
    available: true,
    hasPr: true,
    number: 7,
    state: 'open',
    checks: { total: 3, passed: 1, failed: 2, pending: 0, rollup: 'failing' },
  };
}

function passingChecks(): PrStatusView {
  return {
    available: true,
    hasPr: true,
    number: 7,
    state: 'open',
    checks: { total: 2, passed: 2, failed: 0, pending: 0, rollup: 'passing' },
  };
}

function previewView(
  status: PreviewVerificationView['status'],
  overrides: Partial<PreviewVerificationView> = {},
): PreviewVerificationView {
  return {
    workspaceId: 'ws_1',
    status,
    checkedAt: new Date().toISOString(),
    summary: `preview ${status}`,
    degraded: false,
    checks: [],
    screenshotRef: null,
    ...overrides,
  };
}

function cleanWorktree(): WorktreeStatusView {
  return { available: true, dirty: false, changedCount: 0 };
}

function dirtyWorktree(changedCount = 2): WorktreeStatusView {
  return { available: true, dirty: true, changedCount };
}

const signalOf = (view: { signals: readonly { id: string; status: string }[] }, id: string) =>
  view.signals.find((s) => s.id === id);

describe('foldReadiness', () => {
  it('(a) conflicting merge → blocked + blockers equal the conflict paths', () => {
    const view = foldReadiness({
      state: 'awaiting_review',
      mergeability: conflictingMerge(['src/a.ts', 'src/b.ts']),
    });
    expect(view.verdict).toBe('blocked');
    expect(view.blockers).toEqual(['src/a.ts', 'src/b.ts']);
    expect(signalOf(view, 'merge')?.status).toBe('fail');
  });

  it('(b) checks rollup failing → blocked + blocker names the failing count', () => {
    const view = foldReadiness({
      state: 'awaiting_review',
      mergeability: cleanMerge(),
      prStatus: failingChecks(),
    });
    expect(view.verdict).toBe('blocked');
    expect(view.blockers).toContain('2 check(s) failing');
    expect(signalOf(view, 'checks')?.status).toBe('fail');
  });

  it('(c) review-terminal + clean merge + checks not failing + preview passed → ready', () => {
    const view = foldReadiness({
      state: 'awaiting_review',
      mergeability: cleanMerge(),
      prStatus: passingChecks(),
      preview: previewView('passed'),
    });
    expect(view.verdict).toBe('ready');
    expect(view.blockers).toEqual([]);
    expect(signalOf(view, 'merge')?.status).toBe('pass');
    expect(signalOf(view, 'preview')?.status).toBe('pass');
  });

  it('(d) attention review_ready on a non-review-terminal state + clean merge → ready', () => {
    const view = foldReadiness({
      state: 'running',
      attention: 'review_ready',
      mergeability: cleanMerge(),
    });
    expect(view.verdict).toBe('ready');
    expect(signalOf(view, 'lifecycle')?.status).toBe('pass');
  });

  it('(e) running (not review-terminal) → not_ready and lifecycle pending (NEVER ready)', () => {
    const view = foldReadiness({ state: 'running', mergeability: cleanMerge() });
    expect(view.verdict).toBe('not_ready');
    expect(view.verdict).not.toBe('ready');
    expect(signalOf(view, 'lifecycle')?.status).toBe('pending');
  });

  it('(f) review-terminal + unknown merge (git-too-old) + no hard blocker → unknown (!= ready)', () => {
    const view = foldReadiness({
      state: 'awaiting_review',
      mergeability: unknownMerge('git too old for merge preflight'),
    });
    expect(view.verdict).toBe('unknown');
    expect(view.verdict).not.toBe('ready');
    expect(signalOf(view, 'merge')?.status).toBe('unknown');
    expect(view.blockers).toEqual([]);
  });

  it('(g) review-terminal + clean merge + degraded preview → ready with preview signal unknown', () => {
    const view = foldReadiness({
      state: 'awaiting_review',
      mergeability: cleanMerge(),
      preview: previewView('skipped', { degraded: true, reason: 'no chrome' }),
    });
    expect(view.verdict).toBe('ready');
    expect(signalOf(view, 'preview')?.status).toBe('unknown');
  });

  it('(h) review-terminal + clean merge + preview failed → not_ready (hard preview fail, not a blocker)', () => {
    const view = foldReadiness({
      state: 'awaiting_review',
      mergeability: cleanMerge(),
      preview: previewView('failed'),
    });
    expect(view.verdict).toBe('not_ready');
    expect(view.blockers).toEqual([]);
    expect(signalOf(view, 'preview')?.status).toBe('fail');
  });

  it('(j) merged → delivered (lifecycle pass "workspace merged"), never not_ready/still-working', () => {
    const view = foldReadiness({ state: 'merged' as WorkspaceState });
    expect(view.verdict).toBe('delivered');
    expect(view.verdict).not.toBe('not_ready');
    const lifecycle = signalOf(view, 'lifecycle');
    expect(lifecycle?.status).toBe('pass');
    expect(lifecycle?.detail).toBe('workspace merged');
    expect(lifecycle?.detail).not.toContain('still working');
    expect(view.blockers).toEqual([]);
  });

  it('(k) merged + a stale conflicting merge probe → still delivered (lifecycle truth wins)', () => {
    const view = foldReadiness({
      state: 'merged' as WorkspaceState,
      mergeability: conflictingMerge(['src/a.ts']),
    });
    expect(view.verdict).toBe('delivered');
    expect(view.blockers).toEqual([]);
  });

  it('(l) archived → terminal (lifecycle unknown "workspace archived"), never still-working', () => {
    const view = foldReadiness({ state: 'archived' as WorkspaceState });
    expect(view.verdict).toBe('terminal');
    const lifecycle = signalOf(view, 'lifecycle');
    expect(lifecycle?.status).toBe('unknown');
    expect(lifecycle?.detail).toBe('workspace archived');
    expect(lifecycle?.detail).not.toContain('still working');
  });

  it('(m) cancelled → terminal (lifecycle unknown "workspace cancelled")', () => {
    const view = foldReadiness({ state: 'cancelled' as WorkspaceState });
    expect(view.verdict).toBe('terminal');
    expect(signalOf(view, 'lifecycle')?.detail).toBe('workspace cancelled');
  });

  it('(n) failed → blocked with a truthful delivery-failed blocker + lifecycle fail', () => {
    const view = foldReadiness({ state: 'failed' as WorkspaceState });
    expect(view.verdict).toBe('blocked');
    expect(view.blockers).toEqual(['workspace delivery failed']);
    const lifecycle = signalOf(view, 'lifecycle');
    expect(lifecycle?.status).toBe('fail');
    expect(lifecycle?.detail).not.toContain('still working');
  });

  it('(o) changes_requested (pre-review rework) → not_ready and lifecycle still working', () => {
    const view = foldReadiness({ state: 'changes_requested' as WorkspaceState });
    expect(view.verdict).toBe('not_ready');
    expect(signalOf(view, 'lifecycle')?.status).toBe('pending');
    expect(signalOf(view, 'lifecycle')?.detail).toContain('still working');
  });

  it('(i) all signals absent (running) → 5 unknown/pending signals, empty blockers, not_ready', () => {
    const input: ReadinessInput = { state: 'running' as WorkspaceState };
    const view = foldReadiness(input);
    expect(view.verdict).toBe('not_ready');
    expect(view.blockers).toEqual([]);
    expect(view.signals.map((s) => s.id)).toEqual(['lifecycle', 'worktree', 'merge', 'checks', 'preview', 'openWork']);
    expect(signalOf(view, 'lifecycle')?.status).toBe('pending');
    expect(signalOf(view, 'worktree')?.status).toBe('unknown');
    expect(signalOf(view, 'merge')?.status).toBe('unknown');
    expect(signalOf(view, 'checks')?.status).toBe('unknown');
    expect(signalOf(view, 'preview')?.status).toBe('unknown');
  });
});

describe('workspaceReadiness edge (allSettled)', () => {
  it('one faulting probe degrades to an absent signal — resolves, never 500s', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const created = await module.createWorkspace(
      makeCreateInput({ command: 'agent-run' }),
      makePrincipal(),
    );
    const workspaceId = created.value!.workspaceId;

    // Deterministic private-probe overrides: mergeability resolves a clean pass;
    // prStatus EXPLODES (the independence proof — its rejection must not 500).
    const probed = module as unknown as {
      mergeability: { probe: (w: unknown) => Promise<MergeabilityView> };
      prStatus: { status: (w: unknown) => Promise<PrStatusView> };
    };
    probed.mergeability = { probe: async () => cleanMerge() };
    probed.prStatus = {
      status: async () => {
        throw new Error('probe exploded');
      },
    };

    const view = await module.workspaceReadiness(workspaceId);

    // The faulting prStatus probe degraded to an ABSENT input ⇒ 'unknown' signal…
    expect(signalOf(view, 'checks')?.status).toBe('unknown');
    // …while the clean mergeability fake still shows through as a real pass.
    expect(signalOf(view, 'merge')?.status).toBe('pass');
  });

  it('missing workspace rejects with a not-found message (→ 404 at the edge)', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    await expect(module.workspaceReadiness('ws_missing')).rejects.toThrow(/not found/);
  });
});

describe('foldReadiness — worktree open-work signal', () => {
  const base: ReadinessInput = {
    state: 'awaiting_review' as WorkspaceState,
    mergeability: cleanMerge(),
    preview: previewView('passed'),
  };

  it('a clean worktree keeps a ready workspace ready and passes the signal', () => {
    const view = foldReadiness({ ...base, worktree: cleanWorktree() });
    expect(view.verdict).toBe('ready');
    expect(signalOf(view, 'worktree')?.status).toBe('pass');
  });

  it('uncommitted work DISCOURAGES merge (not_ready, soft) without a hard blocker', () => {
    const view = foldReadiness({ ...base, worktree: dirtyWorktree(3) });
    expect(view.verdict).toBe('not_ready');
    expect(view.blockers).toEqual([]);
    expect(signalOf(view, 'worktree')?.status).toBe('pending');
    expect(signalOf(view, 'worktree')?.detail).toContain('3 uncommitted');
  });

  it('an absent worktree probe is unknown and never downgrades a ready verdict', () => {
    const view = foldReadiness(base);
    expect(view.verdict).toBe('ready');
    expect(signalOf(view, 'worktree')?.status).toBe('unknown');
  });

  it('a hard blocker still wins over a dirty worktree (blocked, not discouraged)', () => {
    const view = foldReadiness({
      state: 'awaiting_review' as WorkspaceState,
      mergeability: conflictingMerge(['src/a.ts']),
      worktree: dirtyWorktree(),
    });
    expect(view.verdict).toBe('blocked');
    expect(view.blockers).toEqual(['src/a.ts']);
  });

  it('always emits exactly 6 signals in fixed order', () => {
    const view = foldReadiness({ ...base, worktree: cleanWorktree() });
    expect(view.signals.map((s) => s.id)).toEqual(['lifecycle', 'worktree', 'merge', 'checks', 'preview', 'openWork']);
  });

  it('unresolved open work DISCOURAGES merge (not_ready, soft) and lists advisories', () => {
    const view = foldReadiness({
      ...base,
      worktree: cleanWorktree(),
      openWork: { available: true, items: [{ kind: 'criterion', label: '[ ] handle null' }, { kind: 'todo', label: 'a.ts: TODO x' }] },
    });
    expect(view.verdict).toBe('not_ready');
    expect(view.blockers).toEqual([]);
    expect(view.advisories).toEqual(['[ ] handle null', 'a.ts: TODO x']);
    expect(signalOf(view, 'openWork')?.status).toBe('pending');
  });

  it('surfaces a diff-vs-issue COMPLIANCE advisory when the change only partly addresses the criteria', () => {
    const view = foldReadiness({
      ...base,
      worktree: cleanWorktree(),
      openWork: {
        available: true,
        items: [],
        compliance: { rating: 'partial', metCount: 1, total: 2, unmet: ['[ ] emit audit line'], summary: 'change addresses 1/2 acceptance criteria (1 unmet).' },
      },
    });
    expect(view.advisories[0]).toMatch(/1\/2 acceptance criteria/i);
  });

  it('a full-compliance open-work source adds no compliance advisory', () => {
    const view = foldReadiness({
      ...base,
      worktree: cleanWorktree(),
      openWork: { available: true, items: [], compliance: { rating: 'full', metCount: 2, total: 2, unmet: [], summary: 'all criteria addressed' } },
    });
    expect(view.advisories).toEqual([]);
  });

  it('a probed open-work source with NO items keeps ready and carries no advisories', () => {
    const view = foldReadiness({ ...base, worktree: cleanWorktree(), openWork: { available: true, items: [] } });
    expect(view.verdict).toBe('ready');
    expect(view.advisories).toEqual([]);
    expect(signalOf(view, 'openWork')?.status).toBe('pass');
  });

  it('an unavailable open-work probe is unknown and never downgrades a ready verdict', () => {
    const view = foldReadiness({ ...base, worktree: cleanWorktree(), openWork: { available: false, items: [], reason: 'down' } });
    expect(view.verdict).toBe('ready');
    expect(view.advisories).toEqual([]);
    expect(signalOf(view, 'openWork')?.status).toBe('unknown');
  });

  it('a LOCAL check failure hard-blocks the merge and names the failing checks (recoder-fxee)', () => {
    const view = foldReadiness({
      ...base,
      worktree: cleanWorktree(),
      localChecks: { rollup: 'failing', passed: 1, failed: 2, total: 3, failing: ['tests', 'typecheck'] },
    });
    expect(view.verdict).toBe('blocked');
    expect(view.blockers.join(' ')).toMatch(/local checks failing: tests, typecheck/i);
  });

  it('a LOCAL pass FILLS the checks hollow center when GitHub reports nothing', () => {
    const view = foldReadiness({
      ...base,
      worktree: cleanWorktree(),
      localChecks: { rollup: 'passing', passed: 3, failed: 0, total: 3, failing: [] },
    });
    expect(signalOf(view, 'checks')?.status).toBe('pass');
    expect(signalOf(view, 'checks')?.detail).toMatch(/local checks passing/i);
  });

  it('a SECRET added by the diff HARD-BLOCKS the merge even when everything else is clean', () => {
    const view = foldReadiness({
      ...base,
      worktree: cleanWorktree(),
      security: { findings: [{ rule: 'aws-access-key', file: 'config.ts', evidence: 'aws-access-key: AKIA…(20 chars)' }], summary: '1 potential secret(s) added' },
    });
    expect(view.verdict).toBe('blocked');
    expect(view.blockers.join(' ')).toMatch(/secret added: aws-access-key/i);
    expect(view.blockers.join(' ')).toMatch(/config\.ts/);
  });

  it('no security findings never fabricates a block', () => {
    const view = foldReadiness({ ...base, worktree: cleanWorktree(), security: { findings: [], summary: 'no secrets detected in the diff' } });
    expect(view.verdict).toBe('ready');
  });

  it('a hard blocker still wins over open work (blocked, advisories still itemized)', () => {
    const view = foldReadiness({
      state: 'awaiting_review' as WorkspaceState,
      mergeability: conflictingMerge(['src/a.ts']),
      openWork: { available: true, items: [{ kind: 'issue', label: 'recoder-x: follow-up' }] },
    });
    expect(view.verdict).toBe('blocked');
    expect(view.blockers).toEqual(['src/a.ts']);
    expect(view.advisories).toEqual(['recoder-x: follow-up']);
  });
});

describe('foldReadiness — advisory review facet (NEVER a signal)', () => {
  const reviewEvidence: PrReviewEvidenceView = {
    available: true,
    pr: 7,
    diffTruncated: true,
    impact: {
      available: true,
      symbolCount: 2,
      topSymbols: [{ symbol: 'foldReadiness', references: 4 }],
    },
  };

  it('(a) a present review facet passes through UNCHANGED and verdict/signals are identical', () => {
    const input: ReadinessInput = {
      state: 'awaiting_review' as WorkspaceState,
      mergeability: cleanMerge(),
      prStatus: passingChecks(),
      preview: previewView('passed'),
    };
    const without = foldReadiness(input);
    const view = foldReadiness({ ...input, review: reviewEvidence });
    expect(view.review).toEqual(reviewEvidence);
    // ADVISORY law: the review facet must not move the verdict fold at all.
    expect(view.verdict).toBe(without.verdict);
    expect(view.signals).toEqual(without.signals);
    expect(view.blockers).toEqual(without.blockers);
    // …and stays evidence, never a signal (openWork is the 6th signal; review is not).
    expect(view.signals.map((s) => s.id)).toEqual(['lifecycle', 'worktree', 'merge', 'checks', 'preview', 'openWork']);
  });

  it('(b) no review input → review: null (truthful absence)', () => {
    expect(foldReadiness({ state: 'awaiting_review' as WorkspaceState }).review).toBeNull();
    expect(foldReadiness({ state: 'running' as WorkspaceState }).review).toBeNull();
  });

  it('(c) an available:false review (gh missing) still passes through truthfully', () => {
    const view = foldReadiness({
      state: 'awaiting_review' as WorkspaceState,
      mergeability: cleanMerge(),
      review: { available: false, reason: 'gh not installed', pr: 7 },
    });
    expect(view.review).toEqual({ available: false, reason: 'gh not installed', pr: 7 });
    expect(view.verdict).toBe('ready');
  });
});

describe('workspaceReadiness — advisory review probe', () => {
  async function composeWithWorkspace() {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const created = await module.createWorkspace(
      makeCreateInput({ command: 'agent-run' }),
      makePrincipal(),
    );
    const workspaceId = created.value!.workspaceId;
    const probed = module as unknown as {
      mergeability: { probe: (w: unknown) => Promise<MergeabilityView> };
      prStatus: { status: (w: unknown) => Promise<PrStatusView> };
    };
    probed.mergeability = { probe: async () => cleanMerge() };
    return { module, workspaceId, probed };
  }

  it('does NOT invoke the review port when prStatus has no PR (review stays null)', async () => {
    const { module, workspaceId, probed } = await composeWithWorkspace();
    probed.prStatus = { status: async () => ({ available: true, hasPr: false }) };
    let calls = 0;
    module.setPrReview({
      review: async () => {
        calls += 1;
        return { available: true, pr: 1 };
      },
    });
    const view = await module.workspaceReadiness(workspaceId);
    expect(calls).toBe(0);
    expect(view.review).toBeNull();
  });

  it('a REJECTING review port degrades to review:null without failing the read', async () => {
    const { module, workspaceId, probed } = await composeWithWorkspace();
    probed.prStatus = { status: async () => passingChecks() };
    module.setPrReview({
      review: async () => {
        throw new Error('review exploded');
      },
    });
    const view = await module.workspaceReadiness(workspaceId);
    expect(view.review).toBeNull();
    // The rest of the fold is untouched — the checks probe still shows through.
    expect(signalOf(view, 'checks')?.status).toBe('pass');
  });

  it('a fulfilled review port lands as the advisory facet (PR number + worktree repoRoot)', async () => {
    const { module, workspaceId, probed } = await composeWithWorkspace();
    probed.prStatus = { status: async () => passingChecks() };
    let seen: { prNumber: number; repoRoot: string; workspaceId: string } | undefined;
    module.setPrReview({
      review: async (input) => {
        seen = input;
        return { available: true, pr: input.prNumber, diffTruncated: true };
      },
    });
    const view = await module.workspaceReadiness(workspaceId);
    expect(view.review).toEqual({ available: true, pr: 7, diffTruncated: true });
    expect(seen?.prNumber).toBe(7);
    expect(seen?.workspaceId).toBe(workspaceId);
    expect(seen?.repoRoot).toContain('/tmp/fake/');
  });

  it('an UNWIRED port keeps review null (truthful absence, no probe)', async () => {
    const { module, workspaceId, probed } = await composeWithWorkspace();
    probed.prStatus = { status: async () => passingChecks() };
    const view = await module.workspaceReadiness(workspaceId);
    expect(view.review).toBeNull();
  });
});

describe('foldReadiness — PR metadata', () => {
  it('surfaces the open PR identity (number/state/draft/url) when a PR exists', () => {
    const view = foldReadiness({ state: 'awaiting_review' as WorkspaceState, prStatus: passingChecks() });
    expect(view.pr).toEqual({ number: 7, state: 'open', draft: false, url: '' });
  });

  it('pr is null when there is no PR / no prStatus', () => {
    expect(foldReadiness({ state: 'awaiting_review' as WorkspaceState }).pr).toBeNull();
    expect(
      foldReadiness({ state: 'awaiting_review' as WorkspaceState, prStatus: { available: true, hasPr: false } }).pr,
    ).toBeNull();
  });
});
