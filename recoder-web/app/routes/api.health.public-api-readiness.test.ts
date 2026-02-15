import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loader } from './api.health.public-api-readiness';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

async function readJsonBody(response: any): Promise<any> {
  if (typeof response?.json === 'function') return response.json();
  if (response?.data) return response.data;
  if (response?.body) return JSON.parse(response.body);
  return response;
}

describe('api.health.public-api-readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ready when byok readiness is true', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', queue: { selectedBackend: 'redis', hasRedisUrl: true } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ready', overallReady: true, missing: [] }),
      } as Response);

    const request = new Request('http://localhost/api/health/public-api-readiness');
    const response = await loader({
      request,
      context: { cloudflare: { env: { DOCKER_BACKEND_URL: 'http://docker' } } } as any,
      params: {},
    } as any);
    const body = await readJsonBody(response);

    expect(getStatus(response)).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.overallReady).toBe(true);
  });

  it('returns not_ready when byok readiness is false', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', queue: { selectedBackend: 'sqlite', hasRedisUrl: false } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'not_ready', overallReady: false, missing: ['INTERNAL_SERVICE_KEY'] }),
      } as Response);

    const request = new Request('http://localhost/api/health/public-api-readiness');
    const response = await loader({
      request,
      context: { cloudflare: { env: { DOCKER_BACKEND_URL: 'http://docker' } } } as any,
      params: {},
    } as any);
    const body = await readJsonBody(response);

    expect(getStatus(response)).toBe(503);
    expect(body.status).toBe('not_ready');
    expect(body.overallReady).toBe(false);
  });

  it('returns upstream error metadata when docker backend fails', async () => {
    mockFetch.mockRejectedValueOnce(
      Object.assign(new Error('upstream unavailable'), {
        status: 502,
        payload: { error: 'upstream unavailable' },
      }),
    );

    const request = new Request('http://localhost/api/health/public-api-readiness');
    const response = await loader({
      request,
      context: { cloudflare: { env: { DOCKER_BACKEND_URL: 'http://docker' } } } as any,
      params: {},
    } as any);
    const body = await readJsonBody(response);

    expect(getStatus(response)).toBe(502);
    expect(body.status).toBe('error');
    expect(body.error).toContain('upstream unavailable');
    expect(body.upstreamStatus).toBe(502);
  });
});
