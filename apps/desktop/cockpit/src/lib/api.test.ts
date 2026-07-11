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

  it('carries the structured `data` from a 409 rejection on the thrown ApiError (delivery gate)', async () => {
    const gate = { state: 'awaiting_approval', action: 'merge', approvalId: 'appr_1', transitioned: true };
    mockFetch(() =>
      makeResponse({ status: 409, ok: false, body: { success: false, error: 'no approved merge approval', data: gate } }),
    );
    const err = await api.merge('w1', { strategy: 'squash' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.data).toEqual(gate);
  });

  it('leaves ApiError.data undefined when the rejection envelope has no data', async () => {
    mockFetch(() => makeResponse({ status: 500, ok: false, body: { success: false, error: 'boom' } }));
    const err = await api.listWorkspaces().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.data).toBeUndefined();
  });

  // Structured-error unwrapping: the backend may send { code, message, timestamp }
  // instead of a plain string. The message must be extracted, not rendered as
  // "[object Object]".
  it('extracts .message from a structured error object (never "[object Object]")', async () => {
    mockFetch(() =>
      makeResponse({
        status: 500,
        ok: false,
        body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'database unavailable', timestamp: '2026-07-11T00:00:00Z' } },
      }),
    );
    const err = await api.listWorkspaces().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('database unavailable');
    expect(err.message).not.toBe('[object Object]');
  });

  it('extracts .message from a structured 401 error object', async () => {
    mockFetch(() =>
      makeResponse({
        status: 401,
        ok: false,
        body: { success: false, error: { code: 'UNAUTHORIZED', message: 'token expired', timestamp: '2026-07-11T00:00:00Z' } },
      }),
    );
    const err = await api.listWorkspaces().catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.message).toBe('token expired');
    expect(err.message).not.toBe('[object Object]');
  });

  it('falls back to the status-based message when error field is absent', async () => {
    mockFetch(() => makeResponse({ status: 503, ok: false, body: { success: false } }));
    const err = await api.listWorkspaces().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain('503');
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

  it('builds the unified health URL as /api/conductor/health/full', async () => {
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: { status: 'healthy' } } }));
    await api.healthFull();
    expect(lastUrl).toBe(`${BACKEND_URL}/api/conductor/health/full`);
  });

  it('POSTs a chat message to /workspaces/:id/message with the typed text', async () => {
    let captured: RequestInit | undefined;
    mockFetch((url, init) => {
      captured = init;
      lastUrl = url;
      return makeResponse({ status: 200, ok: true, body: { success: true, data: {} } });
    });
    await api.sendMessage('w1', 'add a greeting');
    expect(lastUrl).toBe(`${BACKEND_URL}/api/conductor/workspaces/w1/message`);
    expect(captured?.method).toBe('POST');
    expect(JSON.parse(captured?.body as string)).toEqual({ text: 'add a greeting' });
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

  it('routes brain stats to /api/agent-os/brain/stats (NOT under /api/conductor)', async () => {
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: {} } }));
    await api.brainStats();
    expect(lastUrl).toBe(`${BACKEND_URL}/api/agent-os/brain/stats`);
  });

  it('routes policy evaluate to /api/agent-os/policy/evaluate (NOT under /api/conductor)', async () => {
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: {} } }));
    await api.evaluatePolicy({
      actor: { agentId: 'a', permissions: {} },
      action: 'file.write',
      target: { path: 'x' },
    });
    expect(lastUrl).toBe(`${BACKEND_URL}/api/agent-os/policy/evaluate`);
  });

  it('routes memory candidates list to /api/agent-os/memory/lifecycle/candidates', async () => {
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: [] } }));
    await api.listMemoryCandidates();
    expect(lastUrl).toBe(`${BACKEND_URL}/api/agent-os/memory/lifecycle/candidates`);
  });

  it('encodes the candidate id in the review path', async () => {
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: {} } }));
    await api.reviewMemoryCandidate('mc/9', { accepted: true, reviewedBy: 'op' });
    expect(lastUrl).toBe(`${BACKEND_URL}/api/agent-os/memory/lifecycle/candidates/mc%2F9/review`);
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

  it('serializes the policy evaluate body verbatim as the request body', async () => {
    let captured: RequestInit | undefined;
    mockFetch((_url, init) => {
      captured = init;
      return makeResponse({ status: 200, ok: true, body: { success: true, data: { effect: 'allow' } } });
    });
    const sent = {
      actor: { agentId: 'a', permissions: { defaultFileEffect: 'allow' } },
      action: 'file.write' as const,
      target: { path: 'src/x.ts' },
    };
    await api.evaluatePolicy(sent);
    expect(captured?.method).toBe('POST');
    expect(JSON.parse(captured?.body as string)).toEqual(sent);
  });
});

describe('api agent-os envelope unwrap', () => {
  it('unwraps a PolicyDecision from {success,data}', async () => {
    const decision = { decisionId: 'd1', effect: 'needs_approval', action: 'file.write' };
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: decision } }));
    const result = await api.evaluatePolicy({
      actor: { agentId: 'a', permissions: {} },
      action: 'file.write',
      target: {},
    });
    expect(result).toEqual(decision);
  });

  it('unwraps a BrainStats payload from {success,data}', async () => {
    const brainStats = {
      brain: { enabled: true, report: { available: false, hits: 0, misses: 0, hitRate: 0, tokensSaved: 0, detail: 'not yet read' } },
      governance: { ok: true, entries: 5, tipHash: 'abc123' },
    };
    mockFetch(() => makeResponse({ status: 200, ok: true, body: { success: true, data: brainStats } }));
    const result = await api.brainStats();
    expect(result).toEqual(brainStats);
  });

  it('propagates a backend rejection (e.g. missing evidence) as an ApiError', async () => {
    mockFetch(() =>
      makeResponse({ status: 400, ok: false, body: { success: false, error: 'evidence.taskId is required' } }),
    );
    const err = await api
      .proposeMemoryCandidate({
        scope: 'repo',
        title: 't',
        body: 'b',
        evidence: { taskId: '', artifactId: '' },
        proposedBy: 'op',
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('evidence.taskId is required');
  });
});
