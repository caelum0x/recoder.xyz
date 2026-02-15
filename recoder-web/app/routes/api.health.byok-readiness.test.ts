import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from './api.health.byok-readiness';

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

async function readJsonBody(response: any): Promise<any> {
  if (typeof response?.json === 'function') return response.json();
  if (response?.data) return response.data;
  if (response?.body) return JSON.parse(response.body);
  return response;
}

describe('api.health.byok-readiness', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns not_ready when required envs are missing', async () => {
    vi.stubEnv('INTERNAL_SERVICE_KEY', '');
    vi.stubEnv('MAIN_SITE_URL', '');
    vi.stubEnv('DOCKER_BACKEND_URL', '');

    const response = await loader({ context: {} as any, request: {} as any, params: {} as any } as any);
    const body = await readJsonBody(response);

    expect(getStatus(response)).toBe(503);
    expect(body.status).toBe('not_ready');
    expect(body.overallReady).toBe(false);
    expect(body.missing).toEqual(
      expect.arrayContaining(['INTERNAL_SERVICE_KEY', 'MAIN_SITE_URL', 'DOCKER_BACKEND_URL'])
    );
  });

  it('returns ready when all required envs are configured', async () => {
    vi.stubEnv('INTERNAL_SERVICE_KEY', 'k');
    vi.stubEnv('MAIN_SITE_URL', 'https://recoder.xyz');
    vi.stubEnv('DOCKER_BACKEND_URL', 'https://api.recoder.xyz');

    const response = await loader({ context: {} as any, request: {} as any, params: {} as any } as any);
    const body = await readJsonBody(response);

    expect(getStatus(response)).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.overallReady).toBe(true);
    expect(body.missing).toEqual([]);
  });

  it('prefers Cloudflare env over process env', async () => {
    vi.stubEnv('INTERNAL_SERVICE_KEY', '');
    vi.stubEnv('MAIN_SITE_URL', '');
    vi.stubEnv('DOCKER_BACKEND_URL', '');

    const response = await loader({
      context: {
        cloudflare: {
          env: {
            INTERNAL_SERVICE_KEY: 'k',
            MAIN_SITE_URL: 'https://recoder.xyz',
            DOCKER_BACKEND_URL: 'https://api.recoder.xyz',
          },
        },
      } as any,
      request: {} as any,
      params: {} as any,
    } as any);
    const body = await readJsonBody(response);

    expect(getStatus(response)).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.overallReady).toBe(true);
  });
});
