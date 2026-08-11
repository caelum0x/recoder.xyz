/**
 * Attention classifier — per-state fixtures proving each truthful signal path:
 * durable-state authority, RunEvent turn markers (with newer-turn invalidation),
 * dmux-derived tail heuristics, and the `'unknown'` no-signal invariant (the
 * classifier NEVER guesses when nothing signals).
 */
import { describe, it, expect } from 'vitest';
import type { RunEvent, RunEventType } from '@recoder/agent-os';
import { classifyAttention } from './attention-classifier.js';

let seq = 0;
function ev(type: RunEventType, overrides: Partial<RunEvent> = {}): RunEvent {
  seq += 1;
  return {
    eventId: `ev_${seq}`,
    type,
    taskId: 'task_1',
    runId: 'run_ws_1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('classifyAttention — durable state authority', () => {
  it('awaiting_approval state → awaiting_approval', () => {
    const result = classifyAttention({ state: 'awaiting_approval' });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('awaiting_approval');
  });

  it('awaiting_review state → review_ready', () => {
    expect(classifyAttention({ state: 'awaiting_review' }).attention).toBe('review_ready');
  });

  it('failed state → error', () => {
    expect(classifyAttention({ state: 'failed' }).attention).toBe('error');
  });

  it('durable state wins over a contradicting tail (state of record is authoritative)', () => {
    const result = classifyAttention({
      state: 'awaiting_approval',
      tail: 'Analyzing files... esc to interrupt',
    });
    expect(result.attention).toBe('awaiting_approval');
  });
});

describe('classifyAttention — run-event signals (running workspace)', () => {
  it('failed event → error', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('started'), ev('failed', { message: 'exit 1' })],
    });
    expect(result.attention).toBe('error');
    expect(result.reason).toContain('exit 1');
  });

  it('approval_requested event → awaiting_approval', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('started'), ev('approval_requested')],
    });
    expect(result.attention).toBe('awaiting_approval');
  });

  it('needs_input event → agent_idle_prompt', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('started'), ev('needs_input')],
    });
    expect(result.attention).toBe('agent_idle_prompt');
  });

  it('completed event → review_ready', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('started'), ev('log'), ev('completed')],
    });
    expect(result.attention).toBe('review_ready');
  });

  it('a NEWER user_message invalidates an older completed (fresh turn running)', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('started'), ev('completed'), ev('user_message')],
      tail: '✻ Thinking…',
    });
    // The old completed marker no longer describes the present; the tail decides.
    expect(result.attention).toBe('working');
  });

  it('log / state_transition events alone carry no signal → unknown', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('log'), ev('state_transition')],
    });
    expect(result.attention).toBe('unknown');
  });
});

describe('classifyAttention — terminal-tail heuristics (running workspace)', () => {
  it('"esc to interrupt" → working', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'Compacting context\n✶ Germinating… (esc to interrupt)',
    });
    expect(result.attention).toBe('working');
  });

  it('spinner + progress word → working', () => {
    expect(classifyAttention({ state: 'running', tail: '⠹ Thinking...' }).attention).toBe('working');
  });

  it('approval question → awaiting_approval', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'Do you want to make this edit?\n❯ 1. Yes\n  2. No',
    });
    expect(result.attention).toBe('awaiting_approval');
  });

  it('permission prompt → awaiting_approval', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'Claude needs your permission to run: rm -rf dist',
    });
    expect(result.attention).toBe('awaiting_approval');
  });

  it('settled input prompt → agent_idle_prompt', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'All tests pass. Anything else?\n❯ ',
    });
    expect(result.attention).toBe('agent_idle_prompt');
  });

  it('tail without any recognizable signal → unknown (never guessed)', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'some ordinary program output\nline two',
    });
    expect(result.attention).toBe('unknown');
  });

  it('Omnara: "waiting for your input" → agent_idle_prompt', () => {
    expect(classifyAttention({ state: 'running', tail: 'Done.\nWaiting for your input to continue' }).attention).toBe(
      'agent_idle_prompt',
    );
  });

  it('Omnara: "Press Enter to continue" → agent_idle_prompt', () => {
    expect(classifyAttention({ state: 'running', tail: 'Summary written.\nPress Enter to continue' }).attention).toBe(
      'agent_idle_prompt',
    );
  });

  it('Omnara: a numbered selection menu (2+ options) → agent_idle_prompt', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'Which approach?\n❯ 1. Rebase\n2. Merge commit\n3. Squash',
    });
    expect(result.attention).toBe('agent_idle_prompt');
  });

  it('a single numbered line is NOT treated as a menu (no false needs-input)', () => {
    expect(classifyAttention({ state: 'running', tail: 'Step 1. build the thing and keep going' }).attention).toBe(
      'unknown',
    );
  });
});

describe('classifyAttention — per-agent manifest rules', () => {
  it('codex: a braille spinner in the OSC title → working (osc region, per-agent)', () => {
    // Generic rules read no OSC title; only the codex manifest inspects it.
    const result = classifyAttention({
      state: 'running',
      runtime: 'codex',
      oscTitle: '⠹ codex',
      tail: 'nothing recognizable in the body',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('codex_osc_title_working');
  });

  it('opencode: the "esc dismiss / enter confirm" chrome → awaiting_approval (no generic keyword)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'opencode',
      tail: 'Apply edit to main.ts\nesc dismiss   enter confirm',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('opencode_permission_required');
  });

  it('cursor: a hexagon spinner line → working (per-agent spinner, not generic)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'cursor',
      tail: '⬡ Searching the codebase',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('cursor_spinner_working');
  });

  it('grok: an OSC "Action Required" title → awaiting_approval', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      oscTitle: 'my-session - grok ⚠ Action Required',
      tail: 'some body text',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('grok_osc_title_blocked');
  });

  it('runtime alias "claude-code" resolves to the claude ruleset', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude-code',
      tail: 'showing detailed transcript\nctrl+o to toggle',
    });
    // Matches claude_transcript_viewer → a skip screen, so no tail signal.
    expect(result.attention).toBe('unknown');
    expect(result.reason).toContain('claude_transcript_viewer');
  });

  it('an unknown runtime falls back to the generic ruleset', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'some-future-agent',
      tail: '⠹ Thinking...',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('generic_working');
  });
});

describe('classifyAttention — manifest priority arbitration', () => {
  it('a higher-priority approval rule wins over a lower-priority working rule on the same tail', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      // Both an approval prompt (900) and a working indicator (500) are present.
      tail: 'Do you want to proceed?\n✻ Working… (esc to interrupt)',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('generic_approval_prompt');
  });

  it('grok: the blocked OSC title (1300) outranks a working spinner line (200)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      oscTitle: '⚠ Action Required',
      tail: '⠋ Running tools [stop]',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('grok_osc_title_blocked');
  });
});

describe('classifyAttention — skipStateUpdate screens (no tail signal)', () => {
  it('claude transcript viewer → unknown (a skip screen is not a state)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      tail: 'showing detailed transcript\n↑↓ scroll',
    });
    expect(result.attention).toBe('unknown');
    expect(result.reason).toContain('transcript/menu screen');
  });

  it('claude model picker → unknown (skip screen), never guessed as idle', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      tail: 'Select model\nenter to set as default   esc to cancel',
    });
    expect(result.attention).toBe('unknown');
    expect(result.reason).toContain('claude_model_picker_menu');
  });
});

describe('classifyAttention — manifest no-match is truthful, not idle', () => {
  it('a claude tail matching NO rule → unknown (never herdr-style idle)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      tail: 'ordinary build log line\nanother ordinary line',
    });
    expect(result.attention).toBe('unknown');
    expect(result.reason).toContain('no recognizable signal');
  });
});

describe('classifyAttention — durable/RunEvent tiers still override the tail', () => {
  it('durable awaiting_review beats a working tail (state of record wins)', () => {
    const result = classifyAttention({
      state: 'awaiting_review',
      runtime: 'claude',
      tail: '⠹ Thinking...',
    });
    expect(result.attention).toBe('review_ready');
  });

  it('a completed RunEvent beats a working tail (event tier precedes the tail)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      events: [ev('started'), ev('completed')],
      tail: '⠹ Thinking...',
    });
    expect(result.attention).toBe('review_ready');
  });
});

describe('classifyAttention — the no-signal invariant', () => {
  it('running with no tail and no events → unknown with a truthful reason', () => {
    const result = classifyAttention({ state: 'running' });
    expect(result.attention).toBe('unknown');
    expect(result.reason).toContain('no terminal tail');
  });

  it('null tail (capture returned nothing) is a MISSING signal, not idle', () => {
    expect(classifyAttention({ state: 'running', tail: null }).attention).toBe('unknown');
  });

  it.each(['created', 'setting_up', 'ready', 'merging', 'merged', 'cancelled', 'archived'] as const)(
    'non-live state %s → unknown (no live-attention semantics)',
    (state) => {
      const result = classifyAttention({ state, tail: '⠹ Thinking...' });
      expect(result.attention).toBe('unknown');
      expect(result.reason).toContain(state);
    },
  );
});
