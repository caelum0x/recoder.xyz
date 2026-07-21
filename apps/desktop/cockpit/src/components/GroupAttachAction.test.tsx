// @vitest-environment jsdom
/**
 * GroupAttachAction — the group-wide "open all in terminal" affordance for a
 * parallel-run group. Contracts under test (real component + the real
 * lib/wave-bridge seam; only the injected wave bridge is doubled):
 *
 *  1. Degrade-safe: no hint / null / empty visibleSessions ⇒ renders NOTHING.
 *  2. With a hint + a bridge, "Open all in terminal" appears and clicking it
 *     hands each of the group's sessions to the bridge exactly once, by name.
 *  3. No bridge (plain browser / old shell) ⇒ the button is disabled with the
 *     desktop-app hint and a click is a no-op.
 *
 * The mounts double as the preact-singleton smoke: a second physical preact
 * copy would throw on the useState render and fail loudly here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { GroupAttachAction } from './GroupAttachAction';
import { NO_TERMINAL_BRIDGE_HINT } from '../lib/wave-bridge';
import type { GroupAttachHint } from '../types';

type BridgeGlobal = {
  __RECODER_COCKPIT__?: { openWorkspaceTerminal?: unknown };
};

let container: HTMLDivElement | null = null;

function setBridge(value: unknown): void {
  (globalThis as BridgeGlobal).__RECODER_COCKPIT__ =
    value as BridgeGlobal['__RECODER_COCKPIT__'];
}

function mount(grid: GroupAttachHint | null | undefined): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(
      <GroupAttachAction taskGroup="grp_1" grid={grid} onChanged={() => undefined} />,
      c,
    );
  });
  return c;
}

function attachButton(c: HTMLDivElement): HTMLButtonElement | undefined {
  return Array.from(c.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === 'Open all in terminal',
  ) as HTMLButtonElement | undefined;
}

afterEach(() => {
  if (container) {
    act(() => render(null, container as HTMLDivElement));
    container.remove();
    container = null;
  }
  vi.restoreAllMocks();
  delete (globalThis as BridgeGlobal).__RECODER_COCKPIT__;
});

describe('GroupAttachAction', () => {
  it('renders nothing when there is no attach hint', () => {
    setBridge({ openWorkspaceTerminal: () => undefined });
    expect(mount(undefined).querySelector('button')).toBeNull();
    container?.remove();
    container = null;
    expect(mount(null).querySelector('button')).toBeNull();
    container?.remove();
    container = null;
    expect(mount({ visibleSessions: [] }).querySelector('button')).toBeNull();
  });

  it('renders "Open all in terminal" and hands each session to the bridge once', () => {
    const bridgeFn = vi.fn();
    setBridge({ openWorkspaceTerminal: bridgeFn });

    const c = mount({ visibleSessions: ['recoder-a', 'recoder-b'] });
    const btn = attachButton(c);
    expect(btn).toBeTruthy();
    expect(btn?.disabled).toBe(false);

    act(() => btn?.click());

    expect(bridgeFn).toHaveBeenCalledTimes(2);
    expect(bridgeFn).toHaveBeenNthCalledWith(1, { sessionName: 'recoder-a' });
    expect(bridgeFn).toHaveBeenNthCalledWith(2, { sessionName: 'recoder-b' });
    expect(c.querySelector('.group-attach-error')).toBeNull();
  });

  it('disables the button with the desktop hint when no bridge is present', () => {
    const c = mount({ visibleSessions: ['recoder-a'] });
    const btn = attachButton(c);
    expect(btn).toBeTruthy();
    expect(btn?.disabled).toBe(true);
    expect(btn?.title).toBe(NO_TERMINAL_BRIDGE_HINT);

    // A disabled button dispatches no click — the affordance is a truthful no-op,
    // never a faked attach and never a stray error note.
    act(() => btn?.click());
    expect(c.querySelector('.group-attach-error')).toBeNull();
  });
});
