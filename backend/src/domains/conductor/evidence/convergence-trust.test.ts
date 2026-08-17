/**
 * computeConvergenceTrust — deterministic, explainable trust scoring over sealed
 * convergence evidence. Proves: a verified all-clean multi-candidate merge scores
 * HIGH; a blocked verification caps trust LOW with a review flag; an LLM-authored
 * merge region is ALWAYS surfaced as a review flag; a degraded governance path and
 * contested picks lower the score with truthful factors.
 */
import { describe, it, expect } from 'vitest';
import { computeConvergenceTrust } from './convergence-trust.js';
import type { ConvergenceEvidence } from './convergence-evidence.js';

/** Build a minimal-but-valid evidence record; overrides deep-merge the interesting bits. */
function evidence(overrides: Partial<ConvergenceEvidence> = {}): ConvergenceEvidence {
  return {
    schema: 'recoder.convergence-evidence.v3' as ConvergenceEvidence['schema'],
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

  it('is deterministic — same evidence yields the same score', () => {
    expect(computeConvergenceTrust(evidence())).toEqual(computeConvergenceTrust(evidence()));
  });
});
