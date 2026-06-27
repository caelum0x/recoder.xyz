/**
 * Unit tests for the conductor API client (api.ts).
 *
 * These exercise the REAL request pipeline (`api.*` -> `requestAt`) with only
 * `fetch` and the injected window config replaced by test doubles. Nothing in
 * production code is stubbed: we drive the actual error-classification and
 * envelope-unwrap logic with crafted Response objects.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, BackendUnreachableError, UnauthorizedError } from './api';

const BACKEND_URL = 'http://localhost:3100';

/** Build a minimal Response-like double honoring the fields api.ts reads. */
function makeResponse(opts: { status?: number; ok?: boolean; body?: unknown }): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text =
    opts.body === undefined
      ? ''
      : typeof opts.body === 'string'
        ? opts.body
        : JSON.stringify(opts.body);
  return {
    status,
    ok,
    text: async () => text,
  } as unknown as Response;
}

/** Capture the URL the client builds so we can assert on it. */
let lastUrl: string | undefined;

beforeEach(() => {
  lastUrl = undefined;
  // Inject the shell config the renderer reads via readConfig().
  (globalThis as Record<string, unknown>).window = {
    __RECODER_COCKPIT__: { backendUrl: BACKEND_URL, token: 'test-token' },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).fetch;
});

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    lastUrl = url;
    return impl(url, init);
  });
  (globalThis as Record<string, unknown>).fetch = fn;
  return fn;
}

describe('api request classification', () => {
  it('throws UnauthorizedError on a 401 response', async () => {
    mockFetch(() => makeResponse({ status: 401, ok: false, body: { success: false, error: 'no session' } }));
    await expect(api.listWorkspaces()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(api.listWorkspaces()).rejects.toMatchObject({ status: 401 });
  });

  it('throws UnauthorizedError on a 403 response', async () => {
    mockFetch(() => makeResponse({ status: 403, ok: false, body: { success: false, error: 'forbidden' } }));
    const err = await api.listWorkspaces().catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedError);
    // UnauthorizedError extends ApiError, so it is also an ApiError.
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.message).toBe('forbidden');
  });

  it('throws BackendUnreachableError when fetch itself throws', async () => {
    const cause = new TypeError('Failed to fetch');
    mockFetch(() => {
      throw cause;
    });
    const err = await api.health().catch((e) => e);
    expect(err).toBeInstanceOf(BackendUnreachableError);
    expect(err.cause).toBe(cause);
    expect(err.message).toContain(BACKEND_URL);
  });

  it('throws ApiError (not Unauthorized) on a non-ok, non-401/403 response', async () => {
    mockFetch(() => makeResponse({ status: 500, ok: false, body: { success: false, error: 'boom' } }));
    const err = await api.listWorkspaces().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(UnauthorizedError);
    expect(err.status).toBe(500);
    expect(err.message).toBe('boom');
  });

  it('throws ApiError when the envelope reports success:false even on a 200', async () => {
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: false, error: 'logical failure' } }));
    const err = await api.listWorkspaces().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(UnauthorizedError);
    expect(err.message).toBe('logical failure');
  });
});

describe('api envelope unwrap', () => {
  it('unwraps {success,data} to data', async () => {
    const workspaces = [{ workspaceId: 'w1' }, { workspaceId: 'w2' }];
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: workspaces } }));
    const result = await api.listWorkspaces();
    expect(result).toEqual(workspaces);
  });

  it('returns undefined for a success response with no data field (e.g. DELETE)', async () => {
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true } }));
    const result = await api.killSession('sess-1');
    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty (no body) success response', async () => {
    mockFetch(() => makeResponse({ status: 204, ok: true }));
    const result = await api.reconcile();
    expect(result).toBeUndefined();
  });
});

describe('api URL construction', () => {
  it('builds the URL as backendUrl + /api/conductor + path', async () => {
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: [] } }));
    await api.listWorkspaces();
    expect(lastUrl).toBe(`${BACKEND_URL}/api/conductor/workspaces`);
  });

  it('encodes workspace ids and uses the detail path', async () => {
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: { workspaceId: 'a/b' } } }));
    await api.getWorkspace('a/b');
    expect(lastUrl).toBe(`${BACKEND_URL}/api/conductor/workspaces/a%2Fb`);
  });

  it('routes connectors to /api/connectors (NOT under /api/conductor)', async () => {
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: {} } }));
    await api.connectors();
    expect(lastUrl).toBe(`${BACKEND_URL}/api/connectors/`);
  });

  it('strips a trailing slash from the injected backendUrl when building the URL', async () => {
    (globalThis as Record<string, unknown>).window = {
      __RECODER_COCKPIT__: { backendUrl: 'http://localhost:3100/', token: 't' },
    };
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: [] } }));
    await api.listWorkspaces();
    expect(lastUrl).toBe('http://localhost:3100/api/conductor/workspaces');
  });
});

describe('api request headers', () => {
  it('sends Authorization from the injected token and a JSON content-type for bodies', async () => {
    let captured: RequestInit | undefined;
    mockFetch((_url, init) => {
      captured = init;
      return makeResponse({ status: 200, ok: true, body: { success: true, data: {} } });
    });
    await api.createWorkspace({ spaceId: 's', projectId: 'p', taskId: 't', createdBy: 'u' } as never);
    const headers = captured?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
    expect(captured?.method).toBe('POST');
  });

  it('omits Content-Type for GET requests with no body', async () => {
    let captured: RequestInit | undefined;
    mockFetch((_url, init) => {
      captured = init;
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });
    await api.listWorkspaces();
    const headers = captured?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(captured?.body).toBeUndefined();
  });
});
