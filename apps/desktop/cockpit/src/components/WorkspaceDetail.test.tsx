// @vitest-environment jsdom
/**
 * WorkspaceDetail — two behavior contracts:
 *
 * A. INLINE GATE VERDICT (delivery-gate polish, the high-value cockpit improvement):
 *
 *    When the operator clicks "Open PR" or "Merge" and the conductor's delivery
 *    gate fires a 409 (awaiting_approval), WorkspaceDetail renders a structured
 *    inline gate verdict — action tier, approval ID, transition state, reason —
 *    right where the action was triggered. The operator no longer sees a cryptic
 *    error string; they see exactly what's blocking and what to do next.
 *
 *    Tests:
 *      1. 409 merge → InlineGateVerdict with correct action/tier/reason
 *      2. 409 PR → InlineGateVerdict for 'pr' action
 *      3. Non-409 error (500) → plain action-error (not the gate card)
 *      4. Successful merge (200) → action-note 'Merged.' (no gate card)
 *
 * B. CHAT <-> TERMINAL SURFACE AFFORDANCE ("not scary" terminal, W4):
 *
 *    The Terminal tab defaults to the calm Chat skin; "Show terminal" reveals
 *    the real embedded PTY on demand; "no real PTY" degrades to HTTP surface.
 *
 * Drives the production <WorkspaceDetail/> Preact tree in a real jsdom DOM with
 * only the runtime seams doubled — `fetch`/`window` (api + config) and the
 * desktop PTY bridge (`window.recoderDesktop`), exactly like WorkspaceCenter.test.tsx.
 * Nothing in the cockpit is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { WorkspaceDetail } from './WorkspaceDetail';
import type { Workspace } from '../types';

const BACKEND_URL = 'http://localhost:3100';

/**
 * Words that must NEVER reach the friendly TERMINAL surface — raw machine
 * internals. Note: the detail HEADER legitimately shows the substrate label
 * ("tmux_worktree"), a truthful control-plane fact, so we assert only over the
 * terminal surface region, and the list targets genuine scary jargon (the dead-
 * pane banner, node-pty, the bare PTY/TTY acronyms) — not the substrate name.
 */
const SCARY_WORDS = ['Pane is dead', 'node-pty', 'PTY', 'TTY', 'stderr', 'exit code'];

let container: HTMLDivElement | null = null;

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-detail',
    spaceId: 'default',
    projectId: 'default',
    taskId: 'task_1',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'feature/x',
    baseRef: 'main',
    // A live tmux session is required for the Terminal tab to be enabled.
    sessionName: 'recoder-ws-detail',
    worktreePath: '/tmp/wt/ws-detail',
    state: 'running',
    createdBy: 'op',
    createdAt: new Date('2026-06-29T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-06-29T00:00:00Z').toISOString(),
    ...overrides,
  };
}

function makeResponse(opts: { status?: number; ok?: boolean; body?: unknown }): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return { status, ok, text: async () => text } as unknown as Response;
}

/** A minimal desktop PTY bridge double. `ptyUnavailable` drives the spawn result. */
function installBridge(opts: { ptyUnavailable?: boolean } = {}): {
  spawnCalls: Array<{ command?: string; args?: string[] }>;
} {
  const spawnCalls: Array<{ command?: string; args?: string[] }> = [];
  const w = globalThis as Record<string, unknown>;
  (w.window as Record<string, unknown>).recoderDesktop = {
    spawnTerminal: async (o: { command?: string; args?: string[] }) => {
      spawnCalls.push({ command: o.command, args: o.args });
      return opts.ptyUnavailable
        ? { id: '', success: false, ptyUnavailable: true }
        : { id: 'pty-1', success: true };
    },
    terminalWrite: async () => true,
    terminalResize: async () => true,
    terminalKill: async () => true,
    onTerminalData: () => () => undefined,
    onTerminalExit: () => () => undefined,
  };
  return { spawnCalls };
}

function mount(ws: Workspace): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<WorkspaceDetail workspace={ws} onClose={() => undefined} onChanged={() => undefined} />, c);
  });
  return c;
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function clickButtonByText(c: HTMLDivElement, text: string): void {
  const btn = Array.from(c.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').trim() === text,
  );
  if (!btn) throw new Error(`button "${text}" not found`);
  act(() => {
    btn.click();
  });
}

/** Assert no scary jargon over the friendly terminal surface (not the header). */
function assertNoScaryWording(c: HTMLDivElement): void {
  const surface = c.querySelector('.detail-terminal') ?? c;
  const text = surface.textContent ?? '';
  for (const word of SCARY_WORDS) {
    expect(text).not.toContain(word);
  }
}

beforeEach(() => {
  // The cockpit reads config off window.__RECODER_COCKPIT__; we layer it onto
  // jsdom's real window (kept, so xterm's DOM/host wiring works) rather than
  // replacing it. xterm.open() probes matchMedia for DPR — jsdom omits it, so we
  // provide a benign stub. None of this touches the component's own logic.
  const realWindow = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
  realWindow.__RECODER_COCKPIT__ = { backendUrl: BACKEND_URL, token: 't' };
  if (typeof realWindow.matchMedia !== 'function') {
    realWindow.matchMedia = () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    });
  }
  // RecoderTerminal observes its host for resize; jsdom omits ResizeObserver, so
  // provide a no-op stand-in (the resize callback is irrelevant to these tests).
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver !== 'function') {
    class NoopResizeObserver {
      observe(): void {
        /* no-op */
      }
      unobserve(): void {
        /* no-op */
      }
      disconnect(): void {
        /* no-op */
      }
    }
    (globalThis as Record<string, unknown>).ResizeObserver = NoopResizeObserver;
    realWindow.ResizeObserver = NoopResizeObserver;
  }
  delete (globalThis as Record<string, unknown>).WebSocket;
  // Every backend GET returns an empty success envelope; the toggle/terminal
  // behavior under test does not depend on event/diff/health content.
  (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
    makeResponse({ status: 200, ok: true, body: { success: true, data: [] } }),
  );
});

afterEach(() => {
  if (container) {
    act(() => {
      render(null, container as HTMLDivElement);
    });
    container.remove();
    container = null;
  }
  vi.restoreAllMocks();
  // Keep jsdom's real window; just clear the props we layered onto it and the
  // installed bridge so each test starts from a clean seam.
  const realWindow = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
  if (realWindow) {
    delete realWindow.__RECODER_COCKPIT__;
    delete realWindow.recoderDesktop;
  }
  delete (globalThis as Record<string, unknown>).fetch;
});

describe('WorkspaceDetail Chat <-> Terminal affordance', () => {
  it('lands on the friendly Chat skin with a single "Show terminal" reveal (collapsed by default)', async () => {
    installBridge();
    const c = mount(workspace());
    await flush(10);

    clickButtonByText(c, 'Terminal'); // open the Terminal tab
    await flush(10);

    // Default skin is the calm conversation, not the raw terminal.
    expect(c.querySelector('.conv')).toBeTruthy();
    expect(c.querySelector('.rterm')).toBeNull();
    expect(c.querySelector('.rterm-host')).toBeNull();

    // The reveal affordance is the gentle one-line "Show terminal".
    const toggle = c.querySelector('.detail-terminal-toggle') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    expect(toggle.textContent?.trim()).toBe('Show terminal');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(c.querySelector('.detail-terminal-skin')?.textContent).toBe('Chat');

    assertNoScaryWording(c);
  });

  it('reveals the REAL embedded terminal on flip — actually spawns the PTY for the tmux session', async () => {
    const { spawnCalls } = installBridge();
    const c = mount(workspace());
    await flush(10);

    clickButtonByText(c, 'Terminal');
    await flush(10);

    clickButtonByText(c, 'Show terminal');
    await flush(10);

    // The genuine xterm host is mounted (one engine, never a chat reskin).
    expect(c.querySelector('.rterm')).toBeTruthy();
    expect(c.querySelector('.conv')).toBeNull();

    // It actually drove the desktop bridge to spawn a PTY attaching to THIS
    // workspace's real tmux session — same engine/source as the conductor.
    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0].args).toEqual(['attach', '-t', 'recoder-ws-detail']);

    // The affordance now collapses the terminal, gently.
    const toggle = c.querySelector('.detail-terminal-toggle') as HTMLButtonElement;
    expect(toggle.textContent?.trim()).toBe('Hide terminal');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(c.querySelector('.detail-terminal-skin')?.textContent).toBe('Terminal');
  });

  it('flips back to Chat with "Hide terminal" — the real terminal collapses on demand', async () => {
    installBridge();
    const c = mount(workspace());
    await flush(10);

    clickButtonByText(c, 'Terminal');
    await flush(10);
    clickButtonByText(c, 'Show terminal');
    await flush(10);
    expect(c.querySelector('.rterm')).toBeTruthy();

    clickButtonByText(c, 'Hide terminal');
    await flush(10);

    // Back to the calm default; the raw terminal is gone, not merely hidden.
    expect(c.querySelector('.conv')).toBeTruthy();
    expect(c.querySelector('.rterm')).toBeNull();
    expect((c.querySelector('.detail-terminal-toggle') as HTMLButtonElement).textContent?.trim()).toBe(
      'Show terminal',
    );
    assertNoScaryWording(c);
  });

  it('falls back to the truthful HTTP session surface (no jargon) when the main process reports no real PTY', async () => {
    const { spawnCalls } = installBridge({ ptyUnavailable: true });
    const c = mount(workspace());
    await flush(10);

    clickButtonByText(c, 'Terminal');
    await flush(10);
    clickButtonByText(c, 'Show terminal');
    await flush(20);

    // The embedded xterm genuinely TRIED to spawn (real engine on flip)…
    expect(spawnCalls.length).toBe(1);
    // …and on the "no real PTY" report, WorkspaceDetail gracefully replaces the
    // dead embedded terminal with the truthful HTTP /sessions surface — never a
    // dead terminal, never the raw node-pty/PTY jargon.
    expect(c.querySelector('.rterm')).toBeNull();
    expect(c.querySelector('.terminal-shell')).toBeTruthy();
    assertNoScaryWording(c);
  });
});

/**
 * Delivery-gate polish: inline gate verdict in WorkspaceDetail.
 *
 * When the operator clicks "Open PR" or "Merge" and the conductor gate fires a
 * 409 awaiting_approval, WorkspaceDetail renders a structured InlineGateVerdict
 * card right where the action was triggered — action tier, approval ID,
 * transition state, and reason — instead of a cryptic error string. For any
 * other failure (5xx, network, etc.) the plain .action-error is shown.
 *
 * All four tests drive the REAL WorkspaceDetail + REAL api client. Only `fetch`
 * (the network seam) is doubled.
 */
describe('WorkspaceDetail inline gate verdict', () => {
  /** A reviewable workspace (awaiting_review allows Merge). */
  function reviewWs(overrides: Partial<Workspace> = {}): Workspace {
    return {
      workspaceId: 'ws-gate',
      spaceId: 'default',
      projectId: 'default',
      taskId: 'task_gate',
      runtimeId: 'claude',
      substrate: 'tmux_worktree',
      branch: 'feature/gate-test',
      baseRef: 'main',
      state: 'awaiting_review',
      createdBy: 'op',
      createdAt: new Date('2026-07-01T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-01T00:00:00Z').toISOString(),
      ...overrides,
    };
  }

  function mount(ws: Workspace): HTMLDivElement {
    const c = document.createElement('div');
    document.body.appendChild(c);
    container = c;
    act(() => {
      render(<WorkspaceDetail workspace={ws} onClose={() => undefined} onChanged={() => undefined} />, c);
    });
    return c;
  }

  /**
   * Build a 409 delivery-gate response: the conductor's DeliveryApprovalRequiredError
   * serialises to { success:false, error:<reason>, data:{ state, action, approvalId, transitioned } }.
   */
  function gate409(action: string, approvalId?: string): Response {
    return makeResponse({
      status: 409,
      ok: false,
      body: {
        success: false,
        error: `Delivery blocked: no approving Approval for action '${action}'`,
        data: { state: 'awaiting_approval', action, approvalId, transitioned: true },
      },
    });
  }

  it('shows the structured gate verdict when merge is blocked (409 awaiting_approval)', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/merge')) return gate409('merge');
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    const c = mount(reviewWs());
    await flush(20);

    // Click the Merge action button.
    clickButtonByText(c, 'Merge');
    await flush(20);

    // The gate verdict card is rendered — not a plain error string.
    const verdict = c.querySelector('.detail-gate-verdict');
    expect(verdict).toBeTruthy();

    // It shows the gate blocked the merge.
    expect(verdict?.textContent).toContain('Merge');
    expect(verdict?.textContent).toContain('blocked by delivery gate');

    // The action tier row is visible.
    expect(verdict?.textContent).toContain('Action tier');
    expect(verdict?.textContent).toContain('merge');

    // The reason from the backend error message is shown.
    expect(verdict?.textContent).toContain("Delivery blocked");

    // The "what to do" hint is present.
    expect(verdict?.textContent).toContain('approving Approval');

    // The plain action-error element is NOT shown (this is not a raw error).
    expect(c.querySelector('.action-error')).toBeNull();
  });

  it('shows the gate verdict for a blocked PR action with an approval ID', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/pr')) return gate409('pr.create', 'appr_abc123');
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    // 'running' state allows PR.
    const c = mount(reviewWs({ state: 'running' }));
    await flush(20);

    clickButtonByText(c, 'Open PR');
    await flush(20);

    const verdict = c.querySelector('.detail-gate-verdict');
    expect(verdict).toBeTruthy();

    // Shows PR-specific copy.
    expect(verdict?.textContent).toContain('Open PR');
    expect(verdict?.textContent).toContain('blocked by delivery gate');

    // The approval ID from the backend response is surfaced.
    expect(verdict?.textContent).toContain('appr_abc123');
  });

  it('shows plain action-error (not the gate card) for a non-409 backend failure', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/merge')) {
        return makeResponse({
          status: 500,
          ok: false,
          body: { success: false, error: 'internal server error' },
        });
      }
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    const c = mount(reviewWs());
    await flush(20);

    clickButtonByText(c, 'Merge');
    await flush(20);

    // A 500 is a backend error, not a gate verdict.
    expect(c.querySelector('.detail-gate-verdict')).toBeNull();
    expect(c.querySelector('.action-error')).toBeTruthy();
    expect(c.querySelector('.action-error')?.textContent).toContain('Backend error');
  });

  it('shows the success note and no gate card when merge succeeds', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/merge')) {
        return makeResponse({
          status: 200,
          ok: true,
          body: { success: true, data: { workspaceId: 'ws-gate', branch: 'feature/gate-test', merged: true } },
        });
      }
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    const c = mount(reviewWs());
    await flush(20);

    clickButtonByText(c, 'Merge');
    await flush(20);

    // On success: the success note is shown, the gate card is not.
    expect(c.querySelector('.detail-gate-verdict')).toBeNull();
    expect(c.querySelector('.action-error')).toBeNull();
    expect(c.querySelector('.action-note')).toBeTruthy();
    expect(c.querySelector('.action-note')?.textContent).toContain('Merged.');
  });
});
