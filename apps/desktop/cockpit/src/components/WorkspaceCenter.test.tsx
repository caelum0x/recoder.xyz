// @vitest-environment jsdom
/**
 * WorkspaceCenter conversation behavior — the center pane is a real CHAT.
 *
 * These drive the production <WorkspaceCenter/> Preact tree in a real jsdom DOM
 * with only `fetch`/`window` (the runtime seam) doubled, exactly like api.test.ts.
 * They prove the user-reported bug is fixed:
 *
 *  1. Typing a message + Enter renders the operator's bubble IMMEDIATELY
 *     (optimistic) and POSTs it to POST /workspaces/:id/message {text} to start
 *     the next agent run.
 *  2. When that route 404s (backend not yet deployed), the bubble is NOT dropped:
 *     a truthful "Couldn't send" note is shown on it instead.
 *
 * Nothing in the cockpit is stubbed — the real composer, send pipeline, and api
 * client all run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { WorkspaceCenter } from './WorkspaceCenter';
import type { Workspace } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-chat',
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

/** Build a minimal Response double honoring what api.ts reads. */
function makeResponse(opts: { status?: number; ok?: boolean; body?: unknown }): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return { status, ok, text: async () => text } as unknown as Response;
}

let posted: Array<{ url: string; body: unknown }> = [];

function mountCenter(ws: Workspace): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<WorkspaceCenter workspace={ws} />, c);
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
  // No WebSocket -> the live stream falls back to the package poll loop.
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

/** Type into the composer and submit, like a user pressing Enter. */
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

describe('WorkspaceCenter is a real conversation', () => {
  it('renders the user bubble immediately and POSTs the message to /message', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.endsWith('/message')) {
        posted.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });
        return makeResponse({ status: 200, ok: true, body: { success: true, data: {} } });
      }
      // events / stream output polls
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    const c = mountCenter(workspace({ state: 'awaiting_review' }));
    await flush(20);

    await sendMessage(c, 'Add a greeting to the README');
    // The operator's bubble is in the DOM right away.
    expect(c.textContent).toContain('Add a greeting to the README');
    expect(c.querySelector('.ws-msg-user')).toBeTruthy();

    await flush(20);
    // It was POSTed to the new chat route with the typed text.
    expect(posted).toHaveLength(1);
    expect(posted[0].url).toBe(`${BACKEND_URL}/api/conductor/workspaces/ws-chat/message`);
    expect(posted[0].body).toEqual({ text: 'Add a greeting to the README' });
    // No "couldn't send" note on a successful send.
    expect(c.querySelector('.ws-msg-error')).toBeNull();
  });

  it('keeps the user bubble and shows a truthful note when /message 404s', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/message')) {
        return makeResponse({ status: 404, ok: false, body: { success: false, error: 'not found' } });
      }
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    const c = mountCenter(workspace({ state: 'awaiting_review' }));
    await flush(20);

    await sendMessage(c, 'try anyway');
    await flush(20);

    // The bubble is still there — never dropped.
    expect(c.textContent).toContain('try anyway');
    // And a truthful failure note is shown on it.
    expect(c.querySelector('.ws-msg-error')).toBeTruthy();
    expect(c.textContent).toContain("Couldn't send to the agent");
  });
  it('disables the composer on a terminal (archived) workspace with a truthful reason', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      makeResponse({ status: 200, ok: true, body: { success: true, data: [] } }),
    );
    const c = mountCenter(workspace({ state: 'archived' }));
    await flush(20);
    // No input to invite a message the backend would 400.
    expect(c.querySelector('.ws-cmdbar-input')).toBeNull();
    expect(c.querySelector('.ws-cmdbar-disabled-note')?.textContent).toMatch(/closed/i);
  });
});
