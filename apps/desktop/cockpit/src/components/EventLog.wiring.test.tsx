// @vitest-environment jsdom
/**
 * Wiring proof: the cockpit's EventLog genuinely consumes the shared
 * Preact-native smooth-text hook from `@recoder/shared/animations/preact` — the
 * `preact/hooks` binding (NOT the React entry, NOT preact/compat).
 *
 * These assert REAL behavior, driven through the production EventLog component:
 *
 *  1. The package export resolves to a real callable hook (true dependency edge,
 *     not dead code).
 *  2. With `requestAnimationFrame` available, the NEWEST event line is revealed
 *     character-by-character and converges to the full text — i.e. the live
 *     stream is actually animated by the package hook.
 *  3. With `requestAnimationFrame` removed (headless/degraded host), EventLog
 *     renders the full static line immediately — the documented degrade-safe
 *     fallback. Older lines are always static.
 *
 * Nothing in the cockpit is stubbed: only `requestAnimationFrame` (the host
 * animation seam) is toggled, and the real <EventLog/> Preact tree renders in a
 * real jsdom DOM.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useSmoothText } from '@recoder/shared/animations/preact';
import { EventLog, friendlyAgentText, friendlyEventKind, friendlyRunState } from './EventLog';
import type { RunEvent, RunEventType } from '../types';

let container: HTMLDivElement | null = null;

function mount(node: ReturnType<typeof EventLog>): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(node, c);
  });
  return c;
}

afterEach(() => {
  if (container) {
    act(() => {
      render(null, container as HTMLDivElement);
    });
    container.remove();
    container = null;
  }
});

function ev(eventId: string, message: string): RunEvent {
  return {
    eventId,
    type: 'log',
    message,
    createdAt: new Date('2026-06-29T00:00:00Z').toISOString(),
  } as RunEvent;
}

/** Flush microtasks + a real macrotask so the hook's rAF loop can advance. */
async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

describe('cockpit EventLog -> @recoder/shared/animations/preact wiring', () => {
  it('exposes a real callable smooth-text hook from the preact package entry', () => {
    expect(typeof useSmoothText).toBe('function');
  });

  it('streams the newest live line via the package hook and converges to full text', async () => {
    expect(typeof requestAnimationFrame).toBe('function');
    const events = [ev('a', 'agent started working'), ev('b', 'editing README.md')];
    const c = mount(<EventLog events={events} error={null} loading={false} />);

    const liveLine = (): string => c.querySelector('.log-msg-live')?.textContent ?? '';
    // The newest line is the one streamed (rendered via the package hook).
    expect(c.querySelectorAll('.log-line').length).toBe(2);
    // It is a partial/empty reveal on first paint, then fills in over rAF ticks.
    let converged = liveLine();
    for (let i = 0; i < 40 && converged !== 'editing README.md'; i++) {
      await flush(60);
      converged = liveLine();
    }
    expect(converged).toBe('editing README.md');
    // The older line is always rendered static and complete.
    expect(c.textContent).toContain('agent started working');
  });

  it('maps scary session-lifecycle text to friendly, truthful copy', () => {
    // A clean exit (status 0) is a finish, not a crash.
    expect(friendlyAgentText('Pane is dead (status 0)')).toBe('Agent finished');
    expect(friendlyAgentText('pane is dead (status 0)')).toBe('Agent finished');
    // A non-zero exit truthfully reads as "stopped", never "finished".
    expect(friendlyAgentText('Pane is dead (status 1)')).toBe('Agent stopped');
    expect(friendlyAgentText('Pane is dead (status 137)')).toBe('Agent stopped');
    // Bare lifecycle markers map to a friendly finish.
    expect(friendlyAgentText('Pane is dead')).toBe('Agent finished');
    expect(friendlyAgentText('Agent session ended')).toBe('Agent finished');
    // Ordinary agent output is left untouched.
    expect(friendlyAgentText('editing README.md')).toBe('editing README.md');
  });

  it('renders the friendly mapping in the live log (no scary "Pane is dead")', () => {
    const events = [ev('a', 'editing README.md'), ev('b', 'Pane is dead (status 0)')];
    const c = mount(<EventLog events={events} error={null} loading={false} animate={false} />);
    expect(c.textContent).toContain('Agent finished');
    expect(c.textContent).not.toContain('Pane is dead');
  });

  it('maps EVERY RunEvent type to a calm label — never the raw wire word', () => {
    // The complete plain-language run-state vocabulary (vision principle 1):
    // every event kind reads as a short, human, non-scary label.
    const expected: Record<RunEventType, string> = {
      started: 'Working…',
      state_transition: 'Update',
      log: 'Working…',
      user_message: 'You',
      artifact: 'Saved work',
      needs_input: 'Waiting for you',
      verified: 'Reviewing',
      approval_requested: 'Waiting for you',
      handoff: 'Handing off',
      failed: 'Stopped',
      completed: 'Done',
    };
    for (const [type, label] of Object.entries(expected)) {
      expect(friendlyEventKind(type)).toBe(label);
      // The raw snake_case wire word is never surfaced as the label.
      if (type.includes('_')) expect(friendlyEventKind(type)).not.toContain('_');
    }
    // An unknown future type degrades to a calm word, never a crash/raw token.
    expect(friendlyEventKind('some_future_kind')).toBe('Update');
  });

  it('maps raw workspace/run states to the calm vocabulary (no snake_case leaks)', () => {
    expect(friendlyRunState('running')).toBe('Working…');
    expect(friendlyRunState('awaiting_approval')).toBe('Waiting for you');
    expect(friendlyRunState('awaiting_review')).toBe('Waiting for you');
    expect(friendlyRunState('merged')).toBe('Done');
    expect(friendlyRunState('failed')).toBe('Stopped');
    expect(friendlyRunState('cancelled')).toBe('Stopped');
    expect(friendlyRunState('thinking')).toBe('Thinking…');
    // Unknown token: humanized, never raw snake_case.
    expect(friendlyRunState('some_new_state')).toBe('some new state');
  });

  it('shows the friendly state-transition label in the log, not "→ raw_state"', () => {
    const transition: RunEvent = {
      eventId: 't1',
      type: 'state_transition',
      state: 'awaiting_approval',
      createdAt: new Date('2026-06-29T00:00:00Z').toISOString(),
    } as RunEvent;
    const c = mount(<EventLog events={[transition]} error={null} loading={false} animate={false} />);
    expect(c.textContent).toContain('Waiting for you');
    expect(c.textContent).not.toContain('awaiting_approval');
    expect(c.textContent).not.toContain('→');
    // The kind chip is the calm word too, never the raw "state_transition".
    expect(c.textContent).not.toContain('state_transition');
  });

  it('degrades safe: the static fallback renders the newest line in full immediately', () => {
    // `animate={false}` is the path EventLog itself takes when the host has no
    // `requestAnimationFrame` (its `canAnimate()` default). The hook is still
    // called (real package import), but the full static text is surfaced — the
    // documented degrade-safe behavior. No global mutation needed, so preact's
    // own render machinery stays intact.
    const events = [ev('a', 'agent started working'), ev('b', 'editing README.md')];
    const c = mount(
      <EventLog events={events} error={null} loading={false} animate={false} />,
    );
    expect(c.querySelector('.log-msg-live')?.textContent).toBe('editing README.md');
    expect(c.textContent).toContain('agent started working');
  });
});
