/**
 * Tests for the ops-recorder adapter (FUSION SEAM §d.4).
 *
 * Drives the REAL `forwardToOpsRecorder`, `opsRecorderAvailability`,
 * `opsRecorderUrl`, `isOpsRecorderShape`, and `opsRecorderShapeToDetail` against
 * a stubbed `globalThis.fetch` — the ONLY external IO. Asserts:
 *
 *  - availability is truthfully gated on `OPS_RECORDER_URL`
 *  - forward is skipped silently when the URL is unset (no network call)
 *  - forward succeeds on a 201 body with an `id` field
 *  - forward degrades on non-2xx (returns `{ forwarded: false }`, never throws)
 *  - forward degrades on transport error (never throws)
 *  - `isOpsRecorderShape` correctly identifies the fused payload shape
 *  - `opsRecorderShapeToDetail` builds the detail string for the inline path
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  forwardToOpsRecorder,
  opsRecorderAvailability,
  opsRecorderUrl,
  isOpsRecorderShape,
  opsRecorderShapeToDetail,
  type OpsRecorderIngestShape,
} from './ops-recorder-adapter.js';

const ENV_KEY = 'OPS_RECORDER_URL';
const original = process.env[ENV_KEY];

function setUrl(url: string | undefined): void {
  if (url === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = url;
}

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(impl as unknown as typeof fetch));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const MINIMAL_SHAPE: OpsRecorderIngestShape = {
  source: 'github',
  item_type: 'pull_request',
  title: 'Add retry to payment webhook',
  source_url: 'https://github.com/org/repo/pull/42',
  detected_reason: 'Failing CI for 3 days',
  priority: 'high',
};

beforeEach(() => {
  setUrl(undefined);
});

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// URL / availability
// ---------------------------------------------------------------------------

describe('opsRecorderUrl / availability', () => {
  it('reports unavailable when OPS_RECORDER_URL is unset', () => {
    expect(opsRecorderUrl()).toBeUndefined();
    expect(opsRecorderAvailability()).toEqual({ available: false });
  });

  it('reports available and strips trailing slash when set', () => {
    setUrl('http://127.0.0.1:8000/');
    expect(opsRecorderUrl()).toBe('http://127.0.0.1:8000');
    expect(opsRecorderAvailability()).toEqual({
      available: true,
      url: 'http://127.0.0.1:8000',
    });
  });

  it('preserves URL without a trailing slash', () => {
    setUrl('http://127.0.0.1:8000');
    expect(opsRecorderUrl()).toBe('http://127.0.0.1:8000');
  });
});

// ---------------------------------------------------------------------------
// isOpsRecorderShape
// ---------------------------------------------------------------------------

describe('isOpsRecorderShape', () => {
  it('returns true for a valid ops-recorder payload', () => {
    expect(isOpsRecorderShape(MINIMAL_SHAPE)).toBe(true);
  });

  it('returns true for a payload with optional fields', () => {
    expect(
      isOpsRecorderShape({
        ...MINIMAL_SHAPE,
        assignee: 'alice',
        status: 'open',
        why_it_matters: 'Blocks release',
        recommended_next_action: 'Fix CI',
      }),
    ).toBe(true);
  });

  it('returns false when any required field is missing', () => {
    const { source: _s, ...withoutSource } = MINIMAL_SHAPE;
    expect(isOpsRecorderShape(withoutSource)).toBe(false);

    const { detected_reason: _dr, ...withoutReason } = MINIMAL_SHAPE;
    expect(isOpsRecorderShape(withoutReason)).toBe(false);
  });

  it('returns false for a native WorkSignalInput shape', () => {
    expect(
      isOpsRecorderShape({
        workspaceId: 'ws_1',
        spaceId: 'space_1',
        taskId: 'task_1',
        kind: 'blocked',
      }),
    ).toBe(false);
  });

  it('returns false for null / non-object', () => {
    expect(isOpsRecorderShape(null)).toBe(false);
    expect(isOpsRecorderShape('string')).toBe(false);
    expect(isOpsRecorderShape(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// opsRecorderShapeToDetail
// ---------------------------------------------------------------------------

describe('opsRecorderShapeToDetail', () => {
  it('builds a detail string containing all required fields', () => {
    const { detail, reportedBy } = opsRecorderShapeToDetail(MINIMAL_SHAPE);
    expect(detail).toContain('github/pull_request');
    expect(detail).toContain('Add retry to payment webhook');
    expect(detail).toContain('Failing CI for 3 days');
    expect(detail).toContain('high');
    expect(reportedBy).toBe('py/ops-recorder');
  });

  it('includes optional fields when present', () => {
    const { detail } = opsRecorderShapeToDetail({
      ...MINIMAL_SHAPE,
      assignee: 'alice',
      why_it_matters: 'Blocks release',
      recommended_next_action: 'Fix CI',
    });
    expect(detail).toContain('alice');
    expect(detail).toContain('Blocks release');
    expect(detail).toContain('Fix CI');
  });

  it('omits optional fields when absent', () => {
    const { detail } = opsRecorderShapeToDetail(MINIMAL_SHAPE);
    expect(detail).not.toContain('assignee:');
    expect(detail).not.toContain('why:');
  });
});

// ---------------------------------------------------------------------------
// forwardToOpsRecorder — degrade-safe
// ---------------------------------------------------------------------------

describe('forwardToOpsRecorder — degrade-safe', () => {
  it('skips the network call and returns forwarded:false when OPS_RECORDER_URL is unset', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await forwardToOpsRecorder(MINIMAL_SHAPE);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.forwarded).toBe(false);
    if (!result.forwarded) {
      expect(result.reason).toMatch(/OPS_RECORDER_URL/);
    }
  });

  it('forwards successfully and returns forwarded:true with the signalId on a 201', async () => {
    setUrl('http://127.0.0.1:8000');
    mockFetch(async (_url) => jsonResponse({ id: 'abc123' }, 201));

    const result = await forwardToOpsRecorder(MINIMAL_SHAPE);
    expect(result.forwarded).toBe(true);
    if (result.forwarded) {
      expect(result.signalId).toBe('abc123');
    }
  });

  it('returns forwarded:true with signalId=unknown when response has no id field', async () => {
    setUrl('http://127.0.0.1:8000');
    mockFetch(async (_url) => jsonResponse({ status: 'ok' }, 201));

    const result = await forwardToOpsRecorder(MINIMAL_SHAPE);
    expect(result.forwarded).toBe(true);
    if (result.forwarded) {
      expect(result.signalId).toBe('unknown');
    }
  });

  it('sends the payload to /work-signals/ingest with correct content-type', async () => {
    setUrl('http://127.0.0.1:8000');
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    mockFetch(async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse({ id: 'sig1' }, 201);
    });

    await forwardToOpsRecorder(MINIMAL_SHAPE);
    expect(capturedUrl).toBe('http://127.0.0.1:8000/work-signals/ingest');
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.source).toBe('github');
    expect(body.title).toBe('Add retry to payment webhook');
  });

  it('includes x-api-key header when apiKey is supplied', async () => {
    setUrl('http://127.0.0.1:8000');
    let capturedHeaders: Record<string, string> = {};
    mockFetch(async (_url, init) => {
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      return jsonResponse({ id: 'sig2' }, 201);
    });

    await forwardToOpsRecorder(MINIMAL_SHAPE, 'my-secret-key');
    expect(capturedHeaders['x-api-key']).toBe('my-secret-key');
  });

  it('degrades on a 422 response (never throws) — returns forwarded:false', async () => {
    setUrl('http://127.0.0.1:8000');
    mockFetch(async () => jsonResponse({ detail: 'validation error' }, 422));

    const result = await forwardToOpsRecorder(MINIMAL_SHAPE);
    expect(result.forwarded).toBe(false);
    if (!result.forwarded) {
      expect(result.reason).toMatch(/422/);
    }
  });

  it('degrades on a 503 (service unavailable) — returns forwarded:false', async () => {
    setUrl('http://127.0.0.1:8000');
    mockFetch(async () => jsonResponse({ error: 'service unavailable' }, 503));

    const result = await forwardToOpsRecorder(MINIMAL_SHAPE);
    expect(result.forwarded).toBe(false);
    if (!result.forwarded) {
      expect(result.reason).toMatch(/503/);
    }
  });

  it('degrades on a transport error (ECONNREFUSED) — never throws', async () => {
    setUrl('http://127.0.0.1:8000');
    mockFetch(async () => {
      throw new Error('ECONNREFUSED');
    });

    const result = await forwardToOpsRecorder(MINIMAL_SHAPE);
    expect(result.forwarded).toBe(false);
    if (!result.forwarded) {
      expect(result.reason).toMatch(/ECONNREFUSED/);
    }
  });

  it('degrades on an abort (timeout) — never throws', async () => {
    setUrl('http://127.0.0.1:8000');
    mockFetch(async (_url, init) => {
      // Simulate abort by checking if signal is already aborted or throwing AbortError
      throw new DOMException('The operation was aborted', 'AbortError');
    });

    const result = await forwardToOpsRecorder(MINIMAL_SHAPE);
    expect(result.forwarded).toBe(false);
    // Should not throw — forwarded:false is returned
  });
});
