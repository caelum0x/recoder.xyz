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
import type { PreviewVerificationView } from '../ports/preview-verify.port.js';
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

  it('(i) all signals absent (running) → 4 unknown/pending signals, empty blockers, not_ready', () => {
    const input: ReadinessInput = { state: 'running' as WorkspaceState };
    const view = foldReadiness(input);
    expect(view.verdict).toBe('not_ready');
    expect(view.blockers).toEqual([]);
    expect(view.signals.map((s) => s.id)).toEqual(['lifecycle', 'merge', 'checks', 'preview']);
    expect(signalOf(view, 'lifecycle')?.status).toBe('pending');
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
