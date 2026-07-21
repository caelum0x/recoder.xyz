// @vitest-environment jsdom
/**
 * useListKeyboardNav — the KEY HANDLER, exercised through a real Preact render
 * in jsdom (preact render + preact/test-utils act, the Preact-dup-safe pattern).
 *
 * We dispatch genuine window `keydown` events and assert the cursor motion and
 * the onOpen/onEscape callbacks: clamped no-wrap movement, Enter/Escape, the
 * input-theft guard, modifier pass-through, the navigable/enabled gates, the
 * empty-list no-op, and cursor pruning when the focused id leaves the list.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useListKeyboardNav } from './useListKeyboardNav';

let container: HTMLDivElement | null = null;
let latestFocusedId: string | null = null;

interface ProbeProps {
  ids: readonly string[];
  enabled?: boolean;
  navigable?: boolean;
  onOpen: (id: string) => void;
  onEscape: () => void;
}

function Probe({ ids, enabled, navigable, onOpen, onEscape }: ProbeProps) {
  const { focusedId } = useListKeyboardNav({ ids, enabled, navigable, onOpen, onEscape });
  latestFocusedId = focusedId;
  return h('span', null, focusedId ?? '');
}

function mount(props: ProbeProps): void {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(h(Probe, props), c);
  });
}

function rerender(props: ProbeProps): void {
  act(() => {
    render(h(Probe, props), container!);
  });
}

function press(key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });
}

function pressFrom(target: EventTarget, key: string): void {
  // jsdom's KeyboardEvent ignores a `target` init, so dispatch on the node and
  // let it bubble to the window listener with a real event.target.
  act(() => {
    (target as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}

afterEach(() => {
  if (container) {
    act(() => render(null, container!));
    container.remove();
    container = null;
  }
  latestFocusedId = null;
});

const IDS = ['a', 'b', 'c'];

describe('useListKeyboardNav', () => {
  it('j/ArrowDown move the cursor down, clamped at the last (no wrap)', () => {
    mount({ ids: IDS, onOpen: () => {}, onEscape: () => {} });
    expect(latestFocusedId).toBeNull();
    press('j');
    expect(latestFocusedId).toBe('a');
    press('ArrowDown');
    expect(latestFocusedId).toBe('b');
    press('j');
    expect(latestFocusedId).toBe('c');
    press('j'); // clamp at the bottom
    expect(latestFocusedId).toBe('c');
  });

  it('k/ArrowUp move the cursor up, clamped at the first (no wrap)', () => {
    mount({ ids: IDS, onOpen: () => {}, onEscape: () => {} });
    press('k'); // from no cursor, up lands on the last
    expect(latestFocusedId).toBe('c');
    press('ArrowUp');
    expect(latestFocusedId).toBe('b');
    press('k');
    expect(latestFocusedId).toBe('a');
    press('k'); // clamp at the top
    expect(latestFocusedId).toBe('a');
  });

  it('Enter opens the focused id, and is a no-op when no cursor is set', () => {
    const onOpen = vi.fn();
    mount({ ids: IDS, onOpen, onEscape: () => {} });
    press('Enter'); // no cursor yet
    expect(onOpen).not.toHaveBeenCalled();
    press('j'); // cursor → 'a'
    press('Enter');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('Escape calls onEscape', () => {
    const onEscape = vi.fn();
    mount({ ids: IDS, onOpen: () => {}, onEscape });
    press('Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('ignores keys originating from an input or textarea (not stolen)', () => {
    const onOpen = vi.fn();
    const onEscape = vi.fn();
    mount({ ids: IDS, onOpen, onEscape });
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    container!.appendChild(input);
    container!.appendChild(textarea);

    pressFrom(input, 'j');
    expect(latestFocusedId).toBeNull();
    pressFrom(textarea, 'Escape');
    expect(onEscape).not.toHaveBeenCalled();
    pressFrom(input, 'Enter');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('ignores keys when a modifier (meta/ctrl) is held', () => {
    const onOpen = vi.fn();
    const onEscape = vi.fn();
    mount({ ids: IDS, onOpen, onEscape });
    press('j', { metaKey: true });
    expect(latestFocusedId).toBeNull();
    press('k', { ctrlKey: true });
    expect(latestFocusedId).toBeNull();
    press('Escape', { metaKey: true });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('suppresses directional keys when navigable=false but still fires Escape', () => {
    const onEscape = vi.fn();
    mount({ ids: IDS, navigable: false, onOpen: () => {}, onEscape });
    press('j');
    expect(latestFocusedId).toBeNull();
    press('k');
    expect(latestFocusedId).toBeNull();
    press('Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('is fully inert when enabled=false', () => {
    const onOpen = vi.fn();
    const onEscape = vi.fn();
    mount({ ids: IDS, enabled: false, onOpen, onEscape });
    press('j');
    expect(latestFocusedId).toBeNull();
    press('Escape');
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('empty ids ⇒ every key is a no-op', () => {
    const onOpen = vi.fn();
    mount({ ids: [], onOpen, onEscape: () => {} });
    press('j');
    press('k');
    expect(latestFocusedId).toBeNull();
    press('Enter');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('prunes the cursor to null when its id leaves the list', () => {
    mount({ ids: IDS, onOpen: () => {}, onEscape: () => {} });
    press('j');
    expect(latestFocusedId).toBe('a');
    rerender({ ids: ['b', 'c'], onOpen: () => {}, onEscape: () => {} });
    expect(latestFocusedId).toBeNull();
  });
});
