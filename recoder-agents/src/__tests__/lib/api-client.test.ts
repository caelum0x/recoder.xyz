import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the modules that api-client imports before importing it
vi.mock('@/lib/error-handler', () => ({
  handleApiError: vi.fn(),
  handleNetworkError: vi.fn(),
}));

vi.mock('@/lib/api/errors', () => ({
  parseTierRestrictionError: vi.fn((e: unknown) => e),
  RequestTooLargeError: class RequestTooLargeError extends Error {
    status: number;
    details: unknown;
    constructor(status: number, details: unknown) {
      super('Request is too large');
      this.status = status;
      this.details = details;
    }
  },
}));

import { backendApi } from '@/lib/api-client';
import { handleApiError, handleNetworkError } from '@/lib/error-handler';

describe('backendApi', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns success with parsed JSON on 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await backendApi.get('/test');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 1 });
    expect(result.error).toBeUndefined();
  });

  it('returns error on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not found' }), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await backendApi.get('/missing');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.message).toBe('Not found');
    expect(handleApiError).toHaveBeenCalled();
  });

  it('suppresses error display when showErrors is false', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'fail' }), {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'application/json' },
      }),
    );

    await backendApi.get('/fail', { showErrors: false });

    expect(handleApiError).not.toHaveBeenCalled();
  });

  it('handles fetch rejection as network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await backendApi.get('/offline');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.message).toBe('Failed to fetch');
    expect(handleNetworkError).toHaveBeenCalled();
  });

  it('handles abort/timeout as TIMEOUT error', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const err = new DOMException('The operation was aborted', 'AbortError');
      return Promise.reject(err);
    });

    const result = await backendApi.get('/slow', { timeout: 100 });

    expect(result.success).toBe(false);
    expect(result.error!.message).toBe('Request timeout');
  });

  it('sends POST body as JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await backendApi.post('/create', { name: 'test' });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'test' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('sends requests with credentials: include', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await backendApi.get('/auth-check');

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.credentials).toBe('include');
  });
});
