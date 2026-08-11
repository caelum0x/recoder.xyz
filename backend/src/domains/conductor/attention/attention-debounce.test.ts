/**
 * Attention debounce — proves the clock-free working→idle guard: a brief idle
 * blip mid-work is HELD as `working`, a real idle is published once N
 * consecutive idle reads confirm it, any working read resets the pending count,
 * and `reset` clears the per-workspace guard.
 *
 * Clean-room note: behaviour absorbed from herdr (Apache-2.0,
 * src/pane/agent_detection.rs:39-77) by design only — herdr's time-cap becomes
 * our consecutive-confirm count. No code was copied.
 */
import { describe, it, expect } from 'vitest';
import {
  AttentionDebouncer,
  IDLE_CONFIRMATIONS,
} from './attention-debounce.js';

const WS = 'ws_1';

describe('AttentionDebouncer — working→idle hold', () => {
  it('holds `working` across the first N-1 idle reads, then publishes idle on the Nth', () => {
    const d = new AttentionDebouncer();
    expect(d.publish(WS, 'working')).toBe('working');

    // Reads 1..N-1 are held as `working` (a brief mid-work idle blip).
    for (let i = 1; i < IDLE_CONFIRMATIONS; i += 1) {
      expect(d.publish(WS, 'agent_idle_prompt')).toBe('working');
    }
    // The Nth consecutive idle read confirms the transition.
    expect(d.publish(WS, 'agent_idle_prompt')).toBe('agent_idle_prompt');
  });

  it('debounces an `unknown`-after-`working` blip the same way (unknown is idle-ish)', () => {
    const d = new AttentionDebouncer();
    d.publish(WS, 'working');
    for (let i = 1; i < IDLE_CONFIRMATIONS; i += 1) {
      expect(d.publish(WS, 'unknown')).toBe('working');
    }
    expect(d.publish(WS, 'unknown')).toBe('unknown');
  });

  it('a `working` read mid-hold RESETS the pending count and keeps publishing `working`', () => {
    const d = new AttentionDebouncer();
    d.publish(WS, 'working');
    expect(d.publish(WS, 'agent_idle_prompt')).toBe('working'); // pending = 1
    expect(d.publish(WS, 'working')).toBe('working'); // reset

    // The count restarts: it again takes a full N idle reads to confirm.
    for (let i = 1; i < IDLE_CONFIRMATIONS; i += 1) {
      expect(d.publish(WS, 'agent_idle_prompt')).toBe('working');
    }
    expect(d.publish(WS, 'agent_idle_prompt')).toBe('agent_idle_prompt');
  });

  it('once idle is confirmed it stays published (no re-hold on further idle reads)', () => {
    const d = new AttentionDebouncer();
    d.publish(WS, 'working');
    for (let i = 0; i < IDLE_CONFIRMATIONS; i += 1)
      d.publish(WS, 'agent_idle_prompt');
    // Already idle → not a working→idle transition → published straight through.
    expect(d.publish(WS, 'agent_idle_prompt')).toBe('agent_idle_prompt');
    expect(d.publish(WS, 'unknown')).toBe('unknown');
  });
});

describe('AttentionDebouncer — non-debounced reads publish as-is', () => {
  it('an idle first read (no prior `working`) publishes idle immediately', () => {
    const d = new AttentionDebouncer();
    expect(d.publish(WS, 'agent_idle_prompt')).toBe('agent_idle_prompt');
    expect(d.publish(WS, 'unknown')).toBe('unknown');
  });

  it('strong states publish immediately and clear a pending hold', () => {
    const d = new AttentionDebouncer();
    d.publish(WS, 'working');
    expect(d.publish(WS, 'agent_idle_prompt')).toBe('working'); // pending = 1
    // A strong signal interrupts the hold and publishes at once.
    expect(d.publish(WS, 'awaiting_approval')).toBe('awaiting_approval');

    // The hold was cleared: a following working→idle must re-accrue from zero.
    d.publish(WS, 'working');
    for (let i = 1; i < IDLE_CONFIRMATIONS; i += 1) {
      expect(d.publish(WS, 'agent_idle_prompt')).toBe('working');
    }
    expect(d.publish(WS, 'agent_idle_prompt')).toBe('agent_idle_prompt');
  });

  it('a review_ready read after working publishes immediately (not idle-debounced)', () => {
    const d = new AttentionDebouncer();
    d.publish(WS, 'working');
    expect(d.publish(WS, 'review_ready')).toBe('review_ready');
  });
});

describe('AttentionDebouncer — per-workspace isolation and reset', () => {
  it('holds are tracked independently per workspaceId', () => {
    const d = new AttentionDebouncer();
    d.publish('a', 'working');
    d.publish('b', 'working');
    expect(d.publish('a', 'agent_idle_prompt')).toBe('working'); // a: pending 1
    // b is untouched by a's idle read.
    expect(d.publish('b', 'working')).toBe('working');
  });

  it('reset clears the guard: the next working→idle starts a fresh hold', () => {
    const d = new AttentionDebouncer();
    d.publish(WS, 'working');
    d.publish(WS, 'agent_idle_prompt'); // pending = 1
    d.reset(WS);

    // After reset there is no `working` baseline, so an idle read publishes idle.
    expect(d.publish(WS, 'agent_idle_prompt')).toBe('agent_idle_prompt');
  });
});
