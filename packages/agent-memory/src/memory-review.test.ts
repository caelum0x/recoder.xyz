/**
 * memory-review tests — review invariants: a candidate is reviewable exactly
 * once (no re-accept / re-reject), and a TTL-lapsed wisp is never promotable
 * (AGENTS.md wisp semantics: ephemeral until reviewed in time).
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate } from '@recoder/agent-os';
import { materializeMemoryItem, reviewMemoryCandidate } from './memory-review.js';

function candidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    candidateId: 'c1',
    scope: 'repo',
    title: 'fact',
    body: 'the box is 16GB',
    status: 'candidate_created',
    evidence: { taskId: 't1', artifactId: 'a1' },
    proposedBy: 'agent:1',
    proposedAt: '2026-07-15T00:00:00Z',
    ...overrides,
  };
}

describe('reviewMemoryCandidate', () => {
  it('accepts an unexpired candidate_created candidate', () => {
    const reviewed = reviewMemoryCandidate(
      candidate({ expiresAt: '2026-07-16T00:00:00Z' }),
      { accepted: true, reviewedBy: 'u1', reviewedAt: '2026-07-15T12:00:00Z' },
    );
    expect(reviewed.status).toBe('accepted');
    expect(reviewed.reviewedBy).toBe('u1');
  });

  it('rejects an unexpired candidate_created candidate', () => {
    const reviewed = reviewMemoryCandidate(
      candidate({ expiresAt: '2026-07-16T00:00:00Z' }),
      { accepted: false, reviewedBy: 'u1', reviewedAt: '2026-07-15T12:00:00Z', reason: 'stale' },
    );
    expect(reviewed.status).toBe('rejected');
    expect(reviewed.reviewReason).toBe('stale');
  });

  it('reviews a candidate with no expiry (expiresAt undefined)', () => {
    const reviewed = reviewMemoryCandidate(candidate(), {
      accepted: true,
      reviewedBy: 'u1',
      reviewedAt: '2026-07-15T12:00:00Z',
    });
    expect(reviewed.status).toBe('accepted');
  });

  it('reviews a candidate with a null expiry', () => {
    const reviewed = reviewMemoryCandidate(candidate({ expiresAt: null }), {
      accepted: true,
      reviewedBy: 'u1',
      reviewedAt: '2026-07-15T12:00:00Z',
    });
    expect(reviewed.status).toBe('accepted');
  });

  it('refuses to re-accept an already-accepted candidate', () => {
    expect(() =>
      reviewMemoryCandidate(candidate({ status: 'accepted' }), {
        accepted: true,
        reviewedBy: 'u1',
      }),
    ).toThrow(/not reviewable/i);
  });

  it('refuses to re-reject an already-rejected candidate', () => {
    expect(() =>
      reviewMemoryCandidate(candidate({ status: 'rejected' }), {
        accepted: false,
        reviewedBy: 'u1',
        reason: 'again',
      }),
    ).toThrow(/not reviewable/i);
  });

  it('refuses to reject an already-accepted candidate', () => {
    expect(() =>
      reviewMemoryCandidate(candidate({ status: 'accepted' }), {
        accepted: false,
        reviewedBy: 'u1',
        reason: 'flip',
      }),
    ).toThrow(/not reviewable/i);
  });

  it('refuses an expired candidate (expiresAt <= reviewedAt)', () => {
    expect(() =>
      reviewMemoryCandidate(candidate({ expiresAt: '2026-07-15T06:00:00Z' }), {
        accepted: true,
        reviewedBy: 'u1',
        reviewedAt: '2026-07-15T12:00:00Z',
      }),
    ).toThrow(/expired/i);
  });

  it('refuses an expired candidate against the current clock when reviewedAt is omitted', () => {
    expect(() =>
      reviewMemoryCandidate(candidate({ expiresAt: '2020-01-01T00:00:00Z' }), {
        accepted: true,
        reviewedBy: 'u1',
      }),
    ).toThrow(/expired/i);
  });
});

describe('materializeMemoryItem', () => {
  const accepted = candidate({
    status: 'accepted',
    reviewedBy: 'u1',
    reviewedAt: '2026-07-15T12:00:00Z',
  });

  it('materializes an accepted, unexpired candidate', () => {
    const item = materializeMemoryItem(
      { ...accepted, expiresAt: '2026-07-16T00:00:00Z' },
      { memoryId: 'mi_1', acceptedBy: 'u1', createdAt: '2026-07-15T12:00:00Z' },
    );
    expect(item.memoryId).toBe('mi_1');
    expect(item.status).toBe('active');
  });

  it('materializes a candidate with no expiry', () => {
    const item = materializeMemoryItem(accepted, {
      memoryId: 'mi_1',
      acceptedBy: 'u1',
      createdAt: '2026-07-15T12:00:00Z',
    });
    expect(item.status).toBe('active');
  });

  it('refuses an unaccepted candidate', () => {
    expect(() =>
      materializeMemoryItem(candidate(), { memoryId: 'mi_1', acceptedBy: 'u1' }),
    ).toThrow(/unaccepted/i);
  });

  it('refuses an expired candidate (expiresAt <= createdAt)', () => {
    expect(() =>
      materializeMemoryItem(
        { ...accepted, expiresAt: '2026-07-15T06:00:00Z' },
        { memoryId: 'mi_1', acceptedBy: 'u1', createdAt: '2026-07-15T12:00:00Z' },
      ),
    ).toThrow(/expired/i);
  });
});
