/**
 * Attention priority — proves the pure herdr-style precedence
 * (awaiting_approval > error > review_ready/done > working > agent_idle_prompt >
 * unknown), the aggregate "single most-urgent" pick, and the `done` vs
 * `idle-seen` tiebreak (an unseen finished workspace outranks a seen one).
 *
 * Clean-room note: precedence absorbed from herdr (Apache-2.0) by design only —
 * no code was copied.
 */
import { describe, it, expect } from 'vitest';
import type { AttentionState } from '../types.js';
import {
  attentionRank,
  effectiveRank,
  rankAttentions,
} from './attention-priority.js';

describe('attentionRank — exact ordering', () => {
  it('ranks awaiting_approval > error > review_ready > working > agent_idle_prompt > unknown', () => {
    const order: readonly AttentionState[] = [
      'awaiting_approval',
      'error',
      'review_ready',
      'working',
      'agent_idle_prompt',
      'unknown',
    ];
    const ranks = order.map(attentionRank);
    // Strictly monotonically decreasing.
    for (let i = 1; i < ranks.length; i += 1) {
      expect(ranks[i - 1]!).toBeGreaterThan(ranks[i]!);
    }
  });

  it('review_ready is the "done, needs review" tier, above working and idle', () => {
    expect(attentionRank('review_ready')).toBeGreaterThan(
      attentionRank('working')
    );
    expect(attentionRank('review_ready')).toBeGreaterThan(
      attentionRank('agent_idle_prompt')
    );
  });

  it('unknown is the least urgent (a truthful no-signal never jumps the queue)', () => {
    for (const state of [
      'awaiting_approval',
      'error',
      'review_ready',
      'working',
      'agent_idle_prompt',
    ] as const) {
      expect(attentionRank(state)).toBeGreaterThan(attentionRank('unknown'));
    }
  });
});

describe('rankAttentions — aggregate picks the single most-urgent', () => {
  it('returns null for an empty board (nothing needs you)', () => {
    expect(rankAttentions([])).toBeNull();
  });

  it('picks the max-rank workspace across a mixed board', () => {
    const board = [
      { workspaceId: 'a', attention: 'working' as const },
      { workspaceId: 'b', attention: 'unknown' as const },
      { workspaceId: 'c', attention: 'awaiting_approval' as const },
      { workspaceId: 'd', attention: 'review_ready' as const },
    ];
    expect(rankAttentions(board)?.workspaceId).toBe('c');
  });

  it('a board of only idle/unknown still surfaces the most-urgent of them', () => {
    const board = [
      { workspaceId: 'a', attention: 'unknown' as const },
      { workspaceId: 'b', attention: 'agent_idle_prompt' as const },
    ];
    expect(rankAttentions(board)?.workspaceId).toBe('b');
  });
});

describe('done vs idle-seen — the unseen "needs a look" tiebreak', () => {
  it('an UNSEEN finished workspace (done) outranks a SEEN one (idle-seen)', () => {
    const done = { attention: 'review_ready' as const, seen: false };
    const idleSeen = { attention: 'review_ready' as const, seen: true };
    expect(effectiveRank(done)).toBeGreaterThan(effectiveRank(idleSeen));
  });

  it('rankAttentions surfaces the done (unseen) workspace over the seen one', () => {
    const board = [
      { workspaceId: 'seen', attention: 'review_ready' as const, seen: true },
      { workspaceId: 'done', attention: 'review_ready' as const, seen: false },
    ];
    expect(rankAttentions(board)?.workspaceId).toBe('done');
  });

  it('the seen tiebreak never crosses a state tier (a seen review_ready still beats an unseen working)', () => {
    const seenReview = { attention: 'review_ready' as const, seen: true };
    const unseenWorking = { attention: 'working' as const, seen: false };
    expect(effectiveRank(seenReview)).toBeGreaterThan(
      effectiveRank(unseenWorking)
    );
  });

  it('an unseen lower tier never beats a seen higher tier', () => {
    const unseenIdle = { attention: 'agent_idle_prompt' as const, seen: false };
    const seenWorking = { attention: 'working' as const, seen: true };
    expect(effectiveRank(seenWorking)).toBeGreaterThan(
      effectiveRank(unseenIdle)
    );
  });

  it('an absent `seen` flag is treated as unseen (needs a look by default)', () => {
    const noFlag = { attention: 'review_ready' as const };
    const seen = { attention: 'review_ready' as const, seen: true };
    expect(effectiveRank(noFlag)).toBeGreaterThan(effectiveRank(seen));
  });
});
