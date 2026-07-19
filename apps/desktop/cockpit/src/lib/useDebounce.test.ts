// @vitest-environment jsdom
/**
 * useDebounce — the settled-value hook behind the board search. Rendered inside a
 * tiny probe component in jsdom with fake timers so we assert the real Preact
 * effect timing (a value only lands after it has been stable for `delayMs`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'preact';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useDebounce } from './useDebounce';

let container: HTMLDivElement | null = null;
let latest = '';

function Probe({ value, delay }: { value: string; delay: number }) {
  latest = useDebounce(value, delay);
  return h('span', null, latest);
}

function mount(value: string, delay: number): void {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(h(Probe, { value, delay }), c);
  });
}

function rerender(value: string, delay: number): void {
  act(() => {
    render(h(Probe, { value, delay }), container!);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  if (container) {
    act(() => render(null, container!));
    container.remove();
    container = null;
  }
  vi.useRealTimers();
});

describe('useDebounce', () => {
  it('seeds the initial value immediately', () => {
    mount('a', 100);
    expect(latest).toBe('a');
  });

  it('delays a changed value until it has been stable for delayMs', () => {
    mount('a', 100);
    rerender('b', 100);
    expect(latest).toBe('a');
    act(() => { vi.advanceTimersByTime(50); });
    expect(latest).toBe('a');
    act(() => { vi.advanceTimersByTime(50); });
    expect(latest).toBe('b');
  });

  it('resets the timer on rapid changes — only the last value lands', () => {
    mount('a', 100);
    rerender('b', 100);
    act(() => { vi.advanceTimersByTime(80); });
    rerender('c', 100);
    act(() => { vi.advanceTimersByTime(80); });
    expect(latest).toBe('a'); // neither settled yet
    act(() => { vi.advanceTimersByTime(20); });
    expect(latest).toBe('c');
  });

  it('applies immediately when delay is 0', () => {
    mount('a', 0);
    rerender('z', 0);
    act(() => { vi.advanceTimersByTime(0); });
    expect(latest).toBe('z');
  });
});
