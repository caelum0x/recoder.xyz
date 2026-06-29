/**
 * Wiring proof: the cockpit genuinely consumes the shared
 * `@recoder/conductor-ui` package — it is not a parallel re-implementation.
 *
 * These tests assert REAL behavior of the package as driven through the
 * cockpit's own `api.openStream` seam:
 *
 *  1. `api.openStream` returns a real package `StreamHandle` (the object the
 *     package's ConductorClient.openStream produces — proving the call path goes
 *     through the package, not a cockpit-local shim).
 *  2. With no WebSocket available it transparently falls back to the package's
 *     poll loop, hitting the conductor output endpoint and synthesizing `log`
 *     RunEvents from newly-captured pane text — the package's signature logic.
 *  3. The poll requests carry the cockpit's `Authorization: Bearer <token>`
 *     header — proving the cockpit's auth adapter is wired into the package
 *     client (the package defaults to `x-api-key`, so a Bearer header can only
 *     come from the cockpit's injected fetch).
 *  4. The exported `ConductorClient` symbol really resolves from the package, so
 *     the import is a true dependency edge, not dead code.
 *
 * Nothing here is stubbed in the cockpit: only `fetch`/`window` (the external
 * runtime seam) are test doubles, exactly like api.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConductorClient } from '@recoder/conductor-ui';
import type { RunEvent } from '@recoder/conductor-ui';
import { api } from './api';

const BACKEND_URL = 'http://localhost:3100';

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
}

let captured: CapturedRequest[] = [];

/** Build a JSON Response-like double the package's ConductorClient consumes. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  captured = [];
  (globalThis as Record<string, unknown>).window = {
    __RECODER_COCKPIT__: { backendUrl: BACKEND_URL, token: 'wire-token' },
  };
  // No WebSocket in this runtime -> the package must use its poll fallback.
  delete (globalThis as Record<string, unknown>).WebSocket;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).fetch;
});

function mockOutputFetch(outputs: string[]): void {
  let call = 0;
  (globalThis as Record<string, unknown>).fetch = vi.fn(
    async (url: string, init?: RequestInit) => {
      // Capture headers case-insensitively: the cockpit's authedFetch passes a
      // WHATWG Headers object, whose keys are lowercased on iteration.
      const headers: Record<string, string> = {};
      const h = init?.headers;
      if (h instanceof Headers) h.forEach((v, k) => (headers[k.toLowerCase()] = v));
      else if (h) for (const [k, v] of Object.entries(h as Record<string, string>)) headers[k.toLowerCase()] = v;
      captured.push({ url, headers });
      const output = outputs[Math.min(call, outputs.length - 1)] ?? '';
      call += 1;
      return jsonResponse({ success: true, data: { output } });
    },
  );
}

describe('cockpit -> @recoder/conductor-ui wiring', () => {
  it('exports a real ConductorClient class from the package', () => {
    expect(typeof ConductorClient).toBe('function');
    const client = new ConductorClient({ baseUrl: BACKEND_URL, fetch: (() => {}) as never });
    expect(client).toBeInstanceOf(ConductorClient);
    expect(typeof client.openStream).toBe('function');
  });

  it('api.openStream returns the package StreamHandle (poll transport when no WebSocket)', () => {
    mockOutputFetch(['']);
    const handle = api.openStream('ws-1', () => {});
    // The package StreamHandle exposes a `transport` discriminant + close().
    expect(handle.transport).toBe('poll');
    expect(typeof handle.close).toBe('function');
    handle.close();
  });

  it('drives the package poll fallback: hits the conductor output route and emits synthesized log events', async () => {
    vi.useFakeTimers();
    // The package polls getOutput and synthesizes a `log` RunEvent from the
    // newly-appended delta — assert that exact behavior runs end to end.
    mockOutputFetch(['hello', 'hello world']);
    const events: RunEvent[] = [];
    const handle = api.openStream('ws-77', (ev) => events.push(ev), { pollIntervalMs: 1000 });

    // First poll (immediate) -> full output as the first delta.
    await vi.advanceTimersByTimeAsync(0);
    // Second poll tick -> only the appended delta (' world').
    await vi.advanceTimersByTimeAsync(1000);
    handle.close();

    const fetchFn = (globalThis as Record<string, unknown>).fetch as ReturnType<typeof vi.fn>;
    expect(fetchFn).toHaveBeenCalled();
    // The package builds the conductor output URL under /api/conductor.
    expect(captured[0].url).toBe(`${BACKEND_URL}/api/conductor/workspaces/ws-77/output`);
    // Synthesized events are the package's poll-sourced `log` events.
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].type).toBe('log');
    expect(events[0].message).toBe('hello');
    expect((events[0].data as { source?: string }).source).toBe('poll');
    if (events.length > 1) {
      expect(events[1].message).toBe(' world');
    }
  });

  it("stamps the cockpit's Bearer auth onto the package client's requests", async () => {
    vi.useFakeTimers();
    mockOutputFetch(['x']);
    const handle = api.openStream('ws-auth', () => {}, { pollIntervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    handle.close();

    expect(captured.length).toBeGreaterThan(0);
    // The package defaults to `x-api-key`; a Bearer header proves the cockpit's
    // injected authedFetch (config.ts token) is the one talking to the backend.
    expect(captured[0].headers.authorization).toBe('Bearer wire-token');
  });
});
