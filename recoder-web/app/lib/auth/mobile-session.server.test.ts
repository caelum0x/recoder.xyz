import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('~/lib/http/docker-server', () => ({
  getDockerBackendUrl: () => 'http://localhost:3001',
}));

vi.stubGlobal('fetch', mockFetch);

import { verifyMobileSession } from './mobile-session.server';

/**
 * Create a mock request compatible with the test setup's MockRequest class.
 * The setup overrides global.Request with a class that uses Map for headers.
 */
function makeRequest(headers?: Record<string, string>): Request {
  const req = new Request('http://localhost/test') as any;
  // The global MockRequest sets headers as a Map; set values on it
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      req.headers.set(k, v);
    }
  }
  return req as Request;
}

describe('verifyMobileSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no Authorization header is present', async () => {
    const request = makeRequest();
    const result = await verifyMobileSession(request);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null for non-Bearer authorization', async () => {
    const request = makeRequest({ Authorization: 'Basic abc123' });
    const result = await verifyMobileSession(request);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null for request-like objects without headers.get', async () => {
    const request = { method: 'POST' } as unknown as Request;
    const result = await verifyMobileSession(request);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns user info for a valid mobile session token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        valid: true,
        userId: 'user-123',
        deviceId: 'device-abc',
      }),
    });

    const request = makeRequest({ Authorization: 'Bearer valid-mobile-token' });
    const result = await verifyMobileSession(request);
    expect(result).toEqual({
      user: { id: 'user-123' },
      deviceId: 'device-abc',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/mobile/session/validate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'valid-mobile-token' }),
      }),
    );
  });

  it('returns null when backend says token is invalid', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: false }),
    });

    const request = makeRequest({ Authorization: 'Bearer expired-token' });
    const result = await verifyMobileSession(request);
    expect(result).toBeNull();
  });

  it('returns null when backend returns non-OK status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const request = makeRequest({ Authorization: 'Bearer some-token' });
    const result = await verifyMobileSession(request);
    expect(result).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const request = makeRequest({ Authorization: 'Bearer some-token' });
    const result = await verifyMobileSession(request);
    expect(result).toBeNull();
  });
});
