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
import { api, ApiError, UnauthorizedError } from '../lib/api';
import type { GroupAttachHint } from '../types';

/** Flush the microtask queue so an awaited arrange resolves before assertions. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function arrangeButton(c: HTMLDivElement): HTMLButtonElement | undefined {
  return Array.from(c.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').trim().startsWith('Arrange'),
  ) as HTMLButtonElement | undefined;
}

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
    const noHint = mount(undefined);
    expect(noHint.querySelector('button')).toBeNull();
    noHint.remove();
    const nullHint = mount(null);
    expect(nullHint.querySelector('button')).toBeNull();
    nullHint.remove();
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

  it('arrange success opens the returned group session via the bridge', async () => {
    const bridgeFn = vi.fn();
    setBridge({ openWorkspaceTerminal: bridgeFn });
    const spy = vi.spyOn(api, 'arrangeCompareGrid').mockResolvedValue({
      grid: {
        sessionName: 'recoder-group-grp_1',
        visibleSessions: ['recoder-a', 'recoder-b'],
        worktreePaths: ['/w/a', '/w/b'],
        paneCount: 2,
        layout: 'agent-grid',
      },
      verdict: undefined,
    });

    const c = mount({ visibleSessions: ['recoder-a', 'recoder-b'] });
    const arr = arrangeButton(c);
    expect(arr).toBeTruthy();
    expect(arr?.disabled).toBe(false);

    act(() => arr?.click());
    await flush();

    expect(spy).toHaveBeenCalledWith('grp_1');
    expect(bridgeFn).toHaveBeenCalledWith({ sessionName: 'recoder-group-grp_1' });
    expect(c.querySelector('.group-attach-blocked')).toBeNull();
    expect(c.querySelector('.group-attach-note')).toBeNull();
    expect(c.querySelector('.group-attach-error')).toBeNull();
  });

  it('arrange grid:null renders a truthful note and opens nothing', async () => {
    const bridgeFn = vi.fn();
    setBridge({ openWorkspaceTerminal: bridgeFn });
    vi.spyOn(api, 'arrangeCompareGrid').mockResolvedValue({ grid: null, verdict: undefined });

    const c = mount({ visibleSessions: ['recoder-a', 'recoder-b'] });
    act(() => arrangeButton(c)?.click());
    await flush();

    const note = c.querySelector('.group-attach-note');
    expect(note).toBeTruthy();
    expect((note?.textContent ?? '').toLowerCase()).toContain("couldn’t arrange side-by-side");
    expect(bridgeFn).not.toHaveBeenCalled();
    expect(c.querySelector('.group-attach-blocked')).toBeNull();
    expect(c.querySelector('.group-attach-error')).toBeNull();
  });

  it('arrange 403 deny renders "blocked by governance", NOT the generic branch', async () => {
    const bridgeFn = vi.fn();
    setBridge({ openWorkspaceTerminal: bridgeFn });
    // A 403 is thrown as UnauthorizedError, which extends ApiError — the branch
    // guard is `err instanceof ApiError && err.status === 403`.
    const denied = new UnauthorizedError('project write is not permitted by policy', 403);
    vi.spyOn(api, 'arrangeCompareGrid').mockRejectedValue(denied);

    const c = mount({ visibleSessions: ['recoder-a', 'recoder-b'] });
    act(() => arrangeButton(c)?.click());
    await flush();

    const blocked = c.querySelector('.group-attach-blocked');
    expect(blocked).toBeTruthy();
    expect((blocked?.textContent ?? '').toLowerCase()).toContain('blocked by governance');
    expect(blocked?.textContent).toContain('project write is not permitted by policy');
    // The regression the required fix guards: a 403 must NOT fall through to the
    // generic-error path, and must NOT read as an approval prompt.
    expect(c.querySelector('.group-attach-error')).toBeNull();
    expect((blocked?.textContent ?? '').toLowerCase()).not.toContain('approval');
    expect(bridgeFn).not.toHaveBeenCalled();
  });

  it('arrange non-403 error renders the generic note, not the governance note', async () => {
    const bridgeFn = vi.fn();
    setBridge({ openWorkspaceTerminal: bridgeFn });
    vi.spyOn(api, 'arrangeCompareGrid').mockRejectedValue(new ApiError('boom', 500));

    const c = mount({ visibleSessions: ['recoder-a', 'recoder-b'] });
    act(() => arrangeButton(c)?.click());
    await flush();

    const generic = c.querySelector('.group-attach-error');
    expect(generic).toBeTruthy();
    expect(generic?.textContent).toContain('boom');
    expect(c.querySelector('.group-attach-blocked')).toBeNull();
    expect(bridgeFn).not.toHaveBeenCalled();
  });
});
