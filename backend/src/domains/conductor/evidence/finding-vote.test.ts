/**
 * Cross-candidate self-consistency vote — proves N independent agents' agreement is
 * folded truthfully: shared files that auto-merged = converged, shared files where one
 * version was picked = diverged; single-candidate / no-shared-files ⇒ solo (never a
 * fabricated consensus).
 */
import { describe, it, expect } from 'vitest';
import { computeCandidateVote, type VoteSelection } from './finding-vote.js';

const sel = (path: string, contested: boolean, mode?: string): VoteSelection => ({ path, contested, mode });

describe('computeCandidateVote', () => {
  it('solo when there is only one candidate (no cross-agent vote)', () => {
    const v = computeCandidateVote({ candidateCount: 1, selections: [sel('a.ts', true, 'pick')] });
    expect(v.verdict).toBe('solo');
    expect(v.contestedCount).toBe(0);
    expect(v.reviewFlags).toEqual([]);
  });

  it('solo when candidates changed NO shared files (nothing to vote on)', () => {
    const v = computeCandidateVote({
      candidateCount: 3,
      selections: [sel('a.ts', false, 'pick'), sel('b.ts', false, 'synthesize')],
    });
    expect(v.verdict).toBe('solo');
    expect(v.summary).toMatch(/no shared files/i);
  });

  it('STRONG when every shared file auto-converged', () => {
    const v = computeCandidateVote({
      candidateCount: 3,
      selections: [sel('a.ts', true, 'synthesize'), sel('b.ts', true, 'synthesize'), sel('c.ts', false, 'pick')],
    });
    expect(v.verdict).toBe('strong');
    expect(v.agreementRatio).toBe(1);
    expect(v.converged).toEqual(['a.ts', 'b.ts']);
    expect(v.picked).toEqual([]);
    expect(v.reviewFlags).toEqual([]);
  });

  it('MIXED when some shared files converged and some were picked, and flags the picks', () => {
    const v = computeCandidateVote({
      candidateCount: 2,
      selections: [sel('a.ts', true, 'synthesize'), sel('b.ts', true, 'pick')],
    });
    expect(v.verdict).toBe('mixed');
    expect(v.agreementRatio).toBe(0.5);
    expect(v.converged).toEqual(['a.ts']);
    expect(v.picked).toEqual(['b.ts']);
    expect(v.reviewFlags[0]).toMatch(/diverged on 1 shared file/i);
    expect(v.reviewFlags[0]).toMatch(/b\.ts/);
  });

  it('WEAK when every shared file needed a pick (agents diverged everywhere)', () => {
    const v = computeCandidateVote({
      candidateCount: 4,
      selections: [sel('a.ts', true, 'pick'), sel('b.ts', true)],
    });
    expect(v.verdict).toBe('weak');
    expect(v.agreementRatio).toBe(0);
    expect(v.picked).toEqual(['a.ts', 'b.ts']); // absent mode ⇒ treated as picked/diverged
  });

  it('degrades a missing path to a positional label', () => {
    const v = computeCandidateVote({ candidateCount: 2, selections: [{ contested: true, mode: 'pick' }] });
    expect(v.picked).toEqual(['file 1']);
  });
});
