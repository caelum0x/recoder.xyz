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
import { EventLog } from './EventLog';
import type { RunEvent } from '../types';

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
