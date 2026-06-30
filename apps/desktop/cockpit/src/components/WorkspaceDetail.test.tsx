// @vitest-environment jsdom
/**
 * WorkspaceDetail — the Chat <-> Terminal surface affordance, the "not scary"
 * reveal of the real embedded terminal (docs/architecture/RECODER-TERMINAL-VISION.md).
 *
 * Drives the production <WorkspaceDetail/> Preact tree in a real jsdom DOM with
 * only the runtime seams doubled — `fetch`/`window` (api + config) and the
 * desktop PTY bridge (`window.recoderDesktop`), exactly like WorkspaceCenter.test.tsx.
 * These are W4's missing tests; they prove the vision contract:
 *
 *  1. FRIENDLY DEFAULT: the Terminal tab lands on the calm Chat skin and offers a
 *     single gentle "Show terminal" affordance — the real xterm is collapsed by
 *     default, and no scary tmux/pty wording is on screen.
 *  2. REAL-ENGINE-ON-FLIP: clicking "Show terminal" mounts the genuine
 *     RecoderTerminal, which actually calls the desktop bridge's spawnTerminal
 *     (one engine — never a fake TTY) with the workspace's tmux attach command.
 *  3. PTY-UNAVAILABLE FALLBACK: when the main process reports no real PTY, the
 *     embedded xterm (which genuinely tried to spawn) is replaced by the truthful
 *     HTTP /sessions surface — never a dead terminal, never raw node-pty/PTY/
 *     "Pane is dead" jargon.
 *
 * Nothing in the cockpit is stubbed: the real tab state, the real surface toggle,
 * the real RecoderTerminal spawn pipeline, and the real api client all run.
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
