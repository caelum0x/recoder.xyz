/**
 * computeConvergenceTrust — deterministic, explainable trust scoring over sealed
 * convergence evidence. Proves: a verified all-clean multi-candidate merge scores
 * HIGH; a blocked verification caps trust LOW with a review flag; an LLM-authored
 * merge region is ALWAYS surfaced as a review flag; a degraded governance path and
 * contested picks lower the score with truthful factors.
 */
import { describe, it, expect } from 'vitest';
import { calibrateConvergenceTrust, computeConvergenceTrust } from './convergence-trust.js';
import type { ConvergenceEvidence } from './convergence-evidence.js';

/** Build a minimal-but-valid evidence record; overrides deep-merge the interesting bits. */
function evidence(overrides: Partial<ConvergenceEvidence> = {}): ConvergenceEvidence {
  return {
    schema: 'recoder.convergence-evidence/v4',
    taskGroup: 'grp-1',
    chosenWorkspaceId: 'ws-c',
    candidateCount: 2,
    candidates: [
      { workspaceId: 'ws-a', agent: 'claude', branch: 'a', state: 'review_ready', chosen: false } as ConvergenceEvidence['candidates'][number],
      { workspaceId: 'ws-b', agent: 'codex', branch: 'b', state: 'review_ready', chosen: true } as ConvergenceEvidence['candidates'][number],
    ],
    governance: { action: 'workspace.branch', effect: 'allow', riskTier: 'medium', degraded: false },
    verification: { available: true, verdict: 'ready', signals: [], blockers: [] },
    convergence: {
      fromTaskGroup: 'grp-1',
      sourceCount: 2,
      fileCount: 3,
      selections: [
        { path: 'a.ts', mode: 'synthesize', contested: true, contributors: ['ws-a', 'ws-b'] },
        { path: 'b.ts', mode: 'pick', contested: false, sourceWorkspaceId: 'ws-b' },
        { path: 'c.ts', mode: 'synthesize', contested: false },
      ],
    },
    provenance: { actorId: 'user-1', mergedAt: '2026-08-17T00:00:00Z', emittedAt: '2026-08-17T00:00:01Z' },
    contentHash: 'deadbeef',
    ...overrides,
  };
}

describe('computeConvergenceTrust', () => {
  it('uses composed provenance sourceCount so an N-way delivery never collapses to solo', () => {
    const t = computeConvergenceTrust({
      ...evidence({ candidateCount: 1 }),
      convergence: {
        sourceCount: 2,
        fileCount: 2,
        selections: [
          { path: 'picked.ts', mode: 'pick', contested: true },
          { path: 'merged.ts', mode: 'synthesize', contested: true },
        ],
      },
    });
    expect(t.vote).toMatchObject({
      verdict: 'mixed',
      contestedCount: 2,
      picked: ['picked.ts'],
      converged: ['merged.ts'],
    });
    expect(t.factors).toContainEqual(expect.objectContaining({ label: 'breadth', impact: 'positive' }));
  });

  it('scores HIGH for a verified, all-clean, multi-candidate merge with no flags', () => {
    const t = computeConvergenceTrust(evidence());
    expect(t.tier).toBe('high');
    expect(t.score).toBeGreaterThanOrEqual(75);
    expect(t.reviewFlags).toEqual([]);
    expect(t.factors.some((f) => f.label === 'breadth' && f.impact === 'positive')).toBe(true);
  });

  it('caps trust LOW when verification is BLOCKED and flags the blockers', () => {
    const t = computeConvergenceTrust(
      evidence({ verification: { available: true, verdict: 'blocked', signals: [], blockers: ['2 checks failing', 'src/x.ts'] } }),
    );
    expect(t.tier).toBe('low');
    expect(t.score).toBeLessThanOrEqual(30);
    expect(t.reviewFlags.join(' ')).toMatch(/blocker/i);
    expect(t.summary).toMatch(/do not merge/i);
    // A BLOCKED verdict is JUDGED (bad), not unjudgeable — it earned its low score.
    expect(t.unjudgeable).toBe(false);
  });

  it('carries the cross-candidate VOTE and surfaces divergence as review flags', () => {
    // Two agents diverged on b.ts (contested + picked) → the vote flags it for review.
    const t = computeConvergenceTrust(
      evidence({
        candidateCount: 2,
        convergence: {
          fromTaskGroup: 'grp-1',
          sourceCount: 2,
          fileCount: 2,
          selections: [
            { path: 'a.ts', mode: 'synthesize', contested: true, contributors: ['ws-a', 'ws-b'] },
            { path: 'b.ts', mode: 'pick', contested: true, sourceWorkspaceId: 'ws-b' },
          ],
        } as ConvergenceEvidence['convergence'],
      }),
    );
    expect(t.vote.verdict).toBe('mixed');
    expect(t.vote.converged).toEqual(['a.ts']);
    expect(t.vote.picked).toEqual(['b.ts']);
    expect(t.reviewFlags.join(' ')).toMatch(/diverged on 1 shared file/i);
    expect(t.factors.some((f) => f.label === 'candidate-consensus')).toBe(true);
  });

  it('reports a SOLO vote for a single-candidate merge (nothing to vote on)', () => {
    const base = evidence();
    const t = computeConvergenceTrust({
      ...base,
      candidateCount: 1,
      convergence: { ...base.convergence!, sourceCount: 1 },
    });
    expect(t.vote.verdict).toBe('solo');
  });

  it('marks a merge UNJUDGEABLE when the crux verification could not run (vs a verified one)', () => {
    const cannot = computeConvergenceTrust(
      evidence({ verification: { available: false, signals: [], blockers: [] } as ConvergenceEvidence['verification'] }),
    );
    expect(cannot.unjudgeable).toBe(true);
    // A verified merge is judgeable.
    expect(computeConvergenceTrust(evidence()).unjudgeable).toBe(false);
  });

  it('ALWAYS surfaces an LLM-authored merge region as a review flag', () => {
    const base = evidence();
    const t = computeConvergenceTrust({
      ...base,
      convergence: { ...base.convergence!, assisted: [{ path: 'a.ts', inferenceId: 'inf-1' }] },
    });
    expect(t.reviewFlags.join(' ')).toMatch(/LLM-merged file/);
    expect(t.factors.some((f) => f.label === 'llm-assisted-merge' && f.delta < 0)).toBe(true);
  });

  it('deducts for a degraded governance path and flags it', () => {
    const t = computeConvergenceTrust(
      evidence({ governance: { action: 'workspace.branch', effect: 'allow', riskTier: 'medium', degraded: true, reason: 'napi down' } }),
    );
    expect(t.factors.some((f) => f.label === 'governance' && f.delta < 0)).toBe(true);
    expect(t.reviewFlags.join(' ')).toMatch(/degraded/i);
    expect(t.score).toBeLessThan(100);
  });

  it('lowers trust as the clean-merge ratio drops (all-contested picks)', () => {
    const base = evidence();
    const messy = computeConvergenceTrust({
      ...base,
      convergence: {
        ...base.convergence!,
        fileCount: 2,
        selections: [
          { path: 'a.ts', mode: 'pick', contested: true, sourceWorkspaceId: 'ws-a' },
          { path: 'b.ts', mode: 'pick', contested: true, sourceWorkspaceId: 'ws-b' },
        ],
      },
    });
    const clean = computeConvergenceTrust(base);
    expect(messy.score).toBeLessThan(clean.score);
    expect(messy.factors.some((f) => f.label === 'contested-picks')).toBe(true);
  });

  it('folds failed required rules only under the explicit operator mode', () => {
    const result = { id: 'backend-types', text: 'Types pass', check: 'Backend types', status: 'fail' as const };
    const off = computeConvergenceTrust(evidence({ requiredRules: { mode: 'off', results: [result] } }));
    const warn = computeConvergenceTrust(evidence({ requiredRules: { mode: 'warn', results: [result] } }));
    const block = computeConvergenceTrust(evidence({ requiredRules: { mode: 'block', results: [result] } }));
    expect(off.factors.some(factor => factor.label === 'required-rules')).toBe(false);
    expect(warn.score).toBeLessThan(off.score);
    expect(warn.reviewFlags.join(' ')).toMatch(/backend-types/);
    expect(block.score).toBeLessThanOrEqual(30);
  });

  it('is deterministic — same evidence yields the same score', () => {
    expect(computeConvergenceTrust(evidence())).toEqual(computeConvergenceTrust(evidence()));
  });

  it('calibrates only exact deliberate flag matches without erasing evidence penalties', () => {
    const raw = computeConvergenceTrust(evidence({
      candidateCount: 2,
      convergence: {
        sourceCount: 2,
        fileCount: 1,
        selections: [{ path: 'b.ts', mode: 'pick', contested: true, sourceWorkspaceId: 'ws-b' }],
      },
    }));
    const flag = raw.reviewFlags[0]!;
    const dismissed = calibrateConvergenceTrust(raw, [{
      key: 'ignored-by-fold',
      flag,
      disposition: 'dismissed',
      actorId: 'user-1',
      workspaceId: 'ws-old',
      updatedAt: '2026-08-30T20:00:00.000Z',
    }]);
    expect(dismissed.reviewFlags).not.toContain(flag);
    expect(dismissed.score).toBe(raw.score); // dismissal suppresses repetition, not evidence
    expect(dismissed.calibration?.dismissed).toEqual([flag]);

    const accepted = calibrateConvergenceTrust(raw, [{
      key: 'ignored-by-fold',
      flag,
      disposition: 'accepted',
      actorId: 'user-1',
      workspaceId: 'ws-old',
      updatedAt: '2026-08-30T20:00:00.000Z',
    }]);
    expect(accepted.reviewFlags).toContain(flag);
    expect(accepted.score).toBe(raw.score - 3);
    expect(accepted.factors).toContainEqual(expect.objectContaining({ label: 'human-calibration', delta: -3 }));
  });
});
