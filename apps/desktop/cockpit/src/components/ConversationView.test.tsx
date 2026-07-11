// @vitest-environment jsdom
/**
 * ConversationView — the FRIENDLY skin of the workspace detail surface toggle.
 *
 * Drives the production <ConversationView/> Preact tree in a real jsdom DOM with
 * only `fetch`/`window` (the runtime seam) doubled — same approach as
 * WorkspaceCenter.test.tsx. Proves the vision contract:
 *
 *  1. Raw run output is HIDDEN by default ("not scary") behind a "Show output"
 *     affordance, and a plain-language status ("Working…") is shown — never
 *     tmux/pty internals.
 *  2. Toggling "Show output" reveals the same RunEvent stream the full terminal
 *     observes (one engine, two skins).
 *  3. The composer uses sendMessage (starts a run with a prompt) — the SAME write
 *     semantics as the center conversation, NOT raw tmux keystrokes; the user
 *     bubble appears optimistically and the message is POSTed to /message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ConversationView } from './ConversationView';
import type { RunEvent, Workspace } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-conv',
    spaceId: 'default',
    projectId: 'default',
    taskId: 'task_1',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'feature/x',
    baseRef: 'main',
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

const logEvent: RunEvent = {
  eventId: 'ev-1',
  type: 'log',
  taskId: 'task_1',
  message: 'Editing README.md',
  createdAt: new Date('2026-06-29T00:00:01Z').toISOString(),
};

let posted: Array<{ url: string; body: unknown }> = [];

function mount(ws: Workspace): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<ConversationView workspace={ws} />, c);
  });
  return c;
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  posted = [];
  (globalThis as Record<string, unknown>).window = {
    __RECODER_COCKPIT__: { backendUrl: BACKEND_URL, token: 't' },
  };
  delete (globalThis as Record<string, unknown>).WebSocket;
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
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).fetch;
});

async function sendMessage(c: HTMLDivElement, text: string): Promise<void> {
  await act(async () => {
    const input = c.querySelector('.ws-cmdbar-input') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    const form = c.querySelector('form.ws-cmdbar') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('ConversationView is the friendly skin', () => {
  it('shows plain-language status and hides raw output by default', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      makeResponse({ status: 200, ok: true, body: { success: true, data: [logEvent] } }),
    );

    const c = mount(workspace({ state: 'running' }));
    await flush(20);

    // Plain-language status — never tmux/pty internals.
    expect(c.querySelector('.conv-status-label')?.textContent).toBe('Working…');
    // Raw output collapsed: the toggle says "Show output" and the log is absent.
    const toggle = c.querySelector('.conv-output-toggle') as HTMLButtonElement;
    expect(toggle.textContent).toContain('Show output');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(c.querySelector('.conv-output-body')).toBeNull();
  });

  it('reveals the same RunEvent stream when output is expanded', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      makeResponse({ status: 200, ok: true, body: { success: true, data: [logEvent] } }),
    );

    const c = mount(workspace());
    await flush(20);

    await act(async () => {
      (c.querySelector('.conv-output-toggle') as HTMLButtonElement).click();
    });
    await flush(0);

    expect(c.querySelector('.conv-output-body')).toBeTruthy();
    expect(c.textContent).toContain('Editing README.md');
    expect(c.querySelector('.conv-output-toggle')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('sends a message via /message (run semantics) and shows the bubble optimistically', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.endsWith('/message')) {
        posted.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });
        return makeResponse({ status: 200, ok: true, body: { success: true, data: {} } });
      }
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    // awaiting_review is a continuable state — the composer is enabled here.
    const c = mount(workspace({ state: 'awaiting_review' }));
    await flush(20);

    await sendMessage(c, 'Tidy the imports');
    expect(c.textContent).toContain('Tidy the imports');
    expect(c.querySelector('.ws-msg-user')).toBeTruthy();

    await flush(20);
    expect(posted).toHaveLength(1);
    expect(posted[0].url).toBe(`${BACKEND_URL}/api/conductor/workspaces/ws-conv/message`);
    expect(posted[0].body).toEqual({ text: 'Tidy the imports' });
  });

  it('maps a finished agent state to friendly status (no scary internals)', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      makeResponse({ status: 200, ok: true, body: { success: true, data: [] } }),
    );

    const c = mount(workspace({ state: 'merged' }));
    await flush(20);

    // Canonical calm vocabulary: a merged workspace reads "Done", never a scary
    // or machine-y word (and never raw state internals).
    expect(c.querySelector('.conv-status-label')?.textContent).toBe('Done');
  });
});
