/**
 * Attention classifier — per-state fixtures proving each truthful signal path:
 * durable-state authority, RunEvent turn markers (with newer-turn invalidation),
 * dmux-derived tail heuristics, and the `'unknown'` no-signal invariant (the
 * classifier NEVER guesses when nothing signals).
 */
import { describe, it, expect } from 'vitest';
import type { RunEvent, RunEventType } from '@recoder/agent-os';
import { classifyAttention } from './attention-classifier.js';
import { mapHerdrStatus } from './herdr-state.js';

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
    expect(classifyAttention({ state: 'awaiting_review' }).attention).toBe(
      'review_ready'
    );
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
    expect(
      classifyAttention({ state: 'running', tail: '⠹ Thinking...' }).attention
    ).toBe('working');
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
    expect(
      classifyAttention({
        state: 'running',
        tail: 'Done.\nWaiting for your input to continue',
      }).attention
    ).toBe('agent_idle_prompt');
  });

  it('Omnara: "Press Enter to continue" → agent_idle_prompt', () => {
    expect(
      classifyAttention({
        state: 'running',
        tail: 'Summary written.\nPress Enter to continue',
      }).attention
    ).toBe('agent_idle_prompt');
  });

  it('Omnara: a numbered selection menu (2+ options) → agent_idle_prompt', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'Which approach?\n❯ 1. Rebase\n2. Merge commit\n3. Squash',
    });
    expect(result.attention).toBe('agent_idle_prompt');
  });

  it('a single numbered line is NOT treated as a menu (no false needs-input)', () => {
    expect(
      classifyAttention({
        state: 'running',
        tail: 'Step 1. build the thing and keep going',
      }).attention
    ).toBe('unknown');
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
      // herdr requires the nav hint (↑↓ select) alongside the confirm hint.
      tail: 'Apply edit to main.ts\nesc dismiss   enter confirm   ↑↓ select',
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
    expect(classifyAttention({ state: 'running', tail: null }).attention).toBe(
      'unknown'
    );
  });

  it.each([
    'created',
    'setting_up',
    'ready',
    'merging',
    'merged',
    'cancelled',
    'archived',
  ] as const)(
    'non-live state %s → unknown (no live-attention semantics)',
    state => {
      const result = classifyAttention({ state, tail: '⠹ Thinking...' });
      expect(result.attention).toBe('unknown');
      expect(result.reason).toContain(state);
    }
  );
});

// --- deepened herdr-ported corpus: representative fixtures per agent ----------

describe('classifyAttention — claude ruleset (full herdr corpus)', () => {
  it('braille OSC title → working (osc_title_working, 1100)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      oscTitle: '⠋ claude',
      tail: 'building the project',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('claude_osc_title_working');
  });

  it('a live blocked form under the last rule → awaiting_approval (live_blocked_form, 980)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      tail: '──────────\nProceed with edit?\nenter to confirm   esc to cancel',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('claude_live_blocked_form');
  });

  it('the /btw overlay → working (btw_overlay_working, 975)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      tail: '/btw remember to lint\nsome context\nesc to close',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('claude_btw_overlay_working');
  });

  it('a sparkle OSC idle title → agent_idle_prompt (osc_title_idle, 250)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      oscTitle: '✳ my-session',
      tail: 'all done here',
    });
    expect(result.attention).toBe('agent_idle_prompt');
    expect(result.reason).toContain('claude_osc_title_idle');
  });

  it('a claude tail matching NO rule → unknown', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      tail: 'compiling module foo\nlinking artifacts',
    });
    expect(result.attention).toBe('unknown');
    expect(result.reason).toContain('no recognizable signal');
  });
});

describe('classifyAttention — codex ruleset (full herdr corpus)', () => {
  it('OSC "Action Required" title → awaiting_approval (osc_title_blocked, 1100)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'codex',
      oscTitle: 'codex ⚠ Action Required',
      tail: 'body text',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('codex_osc_title_blocked');
  });

  it('the transcript viewer → unknown (skip screen, transcript_viewer, 1000)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'codex',
      tail: 'transcript\n↑/↓ to scroll · pgup/pgdn to page · home/end to jump · q to quit · esc to edit prev',
    });
    expect(result.attention).toBe('unknown');
    expect(result.reason).toContain('codex_transcript_viewer');
    expect(result.reason).toContain('transcript/menu screen');
  });

  it('the trust-directory gate → awaiting_approval (trust_directory, 950 beats generic)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'codex',
      tail: '> You are in /Users/me/proj\nDo you trust the contents of this directory?\n  1. Yes  2. No',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('codex_trust_directory');
  });

  it('"allow command?" strong blocker beats the generic approval on a tie (900, agent-first)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'codex',
      tail: 'Run: ls -la\nallow command?',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('codex_live_strong_blocker');
  });

  it('the "Working (… esc to interrupt)" fallback → working (screen_working_fallback, 500)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'codex',
      tail: 'output line\n• Working (12s · esc to interrupt)',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('codex_screen_working_fallback');
  });

  it('a non-empty, non-spinner OSC title → agent_idle_prompt (osc_title_idle, 100)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'codex',
      oscTitle: 'codex — ready',
      tail: 'all done here',
    });
    expect(result.attention).toBe('agent_idle_prompt');
    expect(result.reason).toContain('codex_osc_title_idle');
  });
});

describe('classifyAttention — cursor ruleset (full herdr corpus)', () => {
  it('write-to-file approval → awaiting_approval (write_file_approval, 320)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'cursor',
      tail: 'Write to this file?\nproceed (y)   reject & propose changes',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('cursor_write_file_approval');
  });

  it('the "(y) (enter)" approval chrome → awaiting_approval (approval_prompt, 300)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'cursor',
      tail: 'Proceed? (y) (enter)',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('cursor_approval_prompt');
  });

  it('a background-task count line → working (background_task_status_working, 95)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'cursor',
      tail: 'idle\n3 background tasks',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('cursor_background_task_status_working');
  });

  it('a cursor tail matching NO rule → unknown', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'cursor',
      tail: 'wrote 3 files\nnothing pending',
    });
    expect(result.attention).toBe('unknown');
  });
});

describe('classifyAttention — opencode ruleset (full herdr corpus)', () => {
  it('the "opencode … esc again to interrupt" hint → working (interrupt_hint_working, 110)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'opencode',
      tail: 'opencode running · esc again to interrupt',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('opencode_interrupt_hint_working');
  });

  it('a solid progress bar → working (progress_bar_working, 100)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'opencode',
      tail: '■■■■■■ building',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('opencode_progress_bar_working');
  });

  it('an opencode tail matching NO rule → unknown', () => {
    expect(
      classifyAttention({
        state: 'running',
        runtime: 'opencode',
        tail: 'saved 2 files',
      }).attention
    ).toBe('unknown');
  });
});

describe('classifyAttention — gemini ruleset (full herdr corpus)', () => {
  it('the "Apply this change" panel → awaiting_approval (apply_or_allow_change, 300)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'gemini',
      tail: '│ Apply this change to config.ts?',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('gemini_apply_or_allow_change');
  });

  it('the "waiting for user confirmation / yes" gate → awaiting_approval', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'gemini',
      tail: '❯ Yes, allow once\n  No\nwaiting for user confirmation',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('gemini_apply_or_allow_change');
  });

  it('a gemini tail matching NO rule → unknown', () => {
    expect(
      classifyAttention({
        state: 'running',
        runtime: 'gemini',
        tail: 'generated file list',
      }).attention
    ).toBe('unknown');
  });
});

describe('classifyAttention — grok ruleset (full herdr corpus)', () => {
  it('the "┃ (○)" option dialog → awaiting_approval (option_dialog_blocked, 1200)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      tail: 'Choose:\n┃  2 (○) Yes, proceed\n┃  z (○) Type your answer here',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('grok_option_dialog_blocked');
  });

  it('permission footer hints → awaiting_approval (permission_hints_blocked, 1190)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      tail: 'prompt\n1/3:select │ Ctrl+o:yolo │ Ctrl+c:cancel',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('grok_permission_hints_blocked');
  });

  it('question-dialog footer hints → awaiting_approval (question_dialog_hints_blocked, 1185)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      tail: 'Question\nEsc:unselect │ Tab:scrollback │ Shift+x:dismiss',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('grok_question_dialog_hints_blocked');
  });

  it('the legacy permission-scope selector → awaiting_approval (permission_scope_selector, 1180)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      tail: '❯ Yes, proceed   No, reject\n←/→:scope',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('grok_permission_scope_selector');
  });

  it('the background-work chip on the top row → working (background_work_chip_working, 1170)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      tail: '⋅ 3 │ chat\n\nbody',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('grok_background_work_chip_working');
  });

  it('a plain "… - grok" idle title → agent_idle_prompt (osc_title_idle, 1100)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      oscTitle: 'my-session - grok',
      tail: 'body',
    });
    expect(result.attention).toBe('agent_idle_prompt');
    expect(result.reason).toContain('grok_osc_title_idle');
  });

  it('any other non-empty title (no spinner, not idle) → working (osc_title_working, 1000)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      oscTitle: 'grok · Exploring src',
      tail: 'body',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('grok_osc_title_working');
  });

  it('a spinner + [stop] status line → working (spinner_status_working, 200)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      tail: '⠧ Waiting on subagent… 2.8s   13s ⇣29.7k [stop]',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('grok_spinner_status_working');
  });

  it('an esc:cancel footer hint → working (esc_cancel_hints_working, 190)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      tail: 'thinking\nEsc:cancel │ Ctrl+.:shortcuts',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('grok_esc_cancel_hints_working');
  });

  it('a legacy "Run/Read/Search" spinner row → working (waiting_tool_working, 120)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      tail: '⠴ Run the test suite',
    });
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('grok_waiting_tool_working');
  });

  it('a settled prompt footer → agent_idle_prompt (prompt_hints_idle, 100)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      tail: 'Ready.\nCtrl+.:shortcuts',
    });
    expect(result.attention).toBe('agent_idle_prompt');
    expect(result.reason).toContain('grok_prompt_hints_idle');
  });

  it('the blocked option dialog (1200) outranks a working [stop] line (200)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok',
      tail: '┃  1 (●) Yes, proceed\n⠧ Running tools [stop]',
    });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('grok_option_dialog_blocked');
  });

  it('a grok tail matching NO rule → unknown', () => {
    expect(
      classifyAttention({
        state: 'running',
        runtime: 'grok',
        tail: 'wrote output\ndone',
      }).attention
    ).toBe('unknown');
  });
});

describe('classifyAttention — pi ruleset (new runtime)', () => {
  it('the literal "Working..." → working', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'pi',
      tail: 'Working...',
    });
    expect(result.attention).toBe('working');
  });

  it('a pi tail matching NO rule → unknown (never faked idle)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'pi',
      tail: 'ordinary output line\nanother line',
    });
    expect(result.attention).toBe('unknown');
    expect(result.reason).toContain('no recognizable signal');
  });
});

describe('classifyAttention — runtime aliases for the new/underscore forms', () => {
  it('"herdr:pi" resolves to the pi ruleset', () => {
    expect(
      classifyAttention({
        state: 'running',
        runtime: 'herdr:pi',
        tail: 'Working...',
      }).attention
    ).toBe('working');
  });

  it('"herdr:opencode" resolves to the opencode ruleset', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'herdr:opencode',
      tail: 'opencode running · esc again to interrupt',
    });
    expect(result.reason).toContain('opencode_interrupt_hint_working');
  });

  it('"gemini-cli" and "gemini_cli" both resolve to the gemini ruleset', () => {
    for (const runtime of ['gemini-cli', 'gemini_cli']) {
      const result = classifyAttention({
        state: 'running',
        runtime,
        tail: '│ Apply this change to config.ts',
      });
      expect(result.reason).toContain('gemini_apply_or_allow_change');
    }
  });

  it('"grok_build" (underscore) resolves to the grok ruleset', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'grok_build',
      oscTitle: 'grok ⚠ Action Required',
      tail: 'body',
    });
    expect(result.reason).toContain('grok_osc_title_blocked');
  });
});

// --- herdr native-state signal (mapHerdrStatus + classifier bypass) ----------

describe('mapHerdrStatus — herdr AgentStatus → AttentionState', () => {
  it.each([
    ['working', 'working'],
    ['blocked', 'awaiting_approval'],
    ['idle', 'agent_idle_prompt'],
    ['done', 'review_ready'],
    ['unknown', 'unknown'],
  ] as const)('maps %s → %s', (status, expected) => {
    expect(mapHerdrStatus(status)).toBe(expected);
  });
});

describe('classifyAttention — nativeAttention (herdr) augments the tail tier', () => {
  it.each([
    ['working', 'working'],
    ['blocked', 'awaiting_approval'],
    ['idle', 'agent_idle_prompt'],
    ['done', 'review_ready'],
  ] as const)(
    'herdr status %s → nativeAttention %s is honoured (running)',
    (status, expected) => {
      const result = classifyAttention({
        state: 'running',
        nativeAttention: mapHerdrStatus(status),
      });
      expect(result.attention).toBe(expected);
      expect(result.reason).toContain('native substrate status');
    }
  );

  it('a definite native signal WINS over a contradicting tail (bypasses the manifest)', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      nativeAttention: mapHerdrStatus('done'), // review_ready
      tail: '⠹ Thinking...', // the manifest would say working
    });
    expect(result.attention).toBe('review_ready');
    expect(result.reason).toContain('native substrate status');
  });

  it('a native "unknown" (herdr had no signal) FALLS THROUGH to the tail — never deletes the tail path', () => {
    const result = classifyAttention({
      state: 'running',
      runtime: 'claude',
      nativeAttention: mapHerdrStatus('unknown'), // unknown → no native signal
      tail: '⠹ Thinking...',
    });
    // The tail heuristics still decide when herdr reports unknown.
    expect(result.attention).toBe('working');
    expect(result.reason).toContain('generic_working');
  });

  it('an absent nativeAttention leaves the tail path unchanged (82 existing tests stay green)', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'Do you want to make this edit?\n❯ 1. Yes\n  2. No',
    });
    expect(result.attention).toBe('awaiting_approval');
  });

  it('the durable state of record still OVERRIDES a native signal', () => {
    const result = classifyAttention({
      state: 'awaiting_review',
      nativeAttention: mapHerdrStatus('working'),
      tail: '⠹ Thinking...',
    });
    expect(result.attention).toBe('review_ready');
    expect(result.reason).toContain('workspace state: awaiting_review');
  });

  it('a terminal RunEvent still OVERRIDES a native signal (event tier precedes native)', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('started'), ev('failed', { message: 'exit 2' })],
      nativeAttention: mapHerdrStatus('working'),
    });
    expect(result.attention).toBe('error');
    expect(result.reason).toContain('exit 2');
  });

  it('native signals do not apply to non-live states (no live-attention semantics)', () => {
    const result = classifyAttention({
      state: 'ready',
      nativeAttention: mapHerdrStatus('working'),
    });
    expect(result.attention).toBe('unknown');
    expect(result.reason).toContain('ready');
  });
});
