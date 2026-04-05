import { describe, it, expect, vi } from 'vitest';
import {
  createDockerAuthHeaders,
  createDockerProxyHeaders,
  dockerFetchJson,
  getBearerOrSessionTokenFromRequest,
  getDockerBackendUrl,
  getSessionTokenFromRequest,
} from './docker-server';

describe('docker-server http helpers', () => {
  it('extracts session token from supported cookie names', () => {
    const request = {
      headers: {
        get: (key: string) =>
          key.toLowerCase() === 'cookie'
            ? 'foo=bar; recoder.session_token=abc123; another=value'
            : null,
      },
    } as unknown as Request;

    expect(getSessionTokenFromRequest(request)).toBe('abc123');
  });

  it('creates auth headers when token is present', () => {
    const request = {
      headers: {
        get: (key: string) =>
          key.toLowerCase() === 'cookie'
            ? '__Secure-recoder.session_token=token-xyz'
            : null,
      },
    } as unknown as Request;

    const headers = createDockerAuthHeaders(request);
    expect(headers.Authorization).toBe('Bearer token-xyz');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('forwards anonymous identity from cookies when no auth token is present', () => {
    const request = {
      headers: {
        get: (key: string) =>
          key.toLowerCase() === 'cookie'
            ? 'recoder_anonymous_id=anon_12345_xyz'
            : null,
      },
    } as unknown as Request;

    const headers = createDockerAuthHeaders(request);
    expect(headers['X-Recoder-Anonymous-Id']).toBe('anon_12345_xyz');
  });

  it('prefers explicit anonymous header over cookie value', () => {
    const request = {
      headers: {
        get: (key: string) => {
          const normalized = key.toLowerCase();
          if (normalized === 'x-recoder-anonymous-id') return 'anon_header_999';
          if (normalized === 'cookie') return 'recoder_anonymous_id=anon_cookie_111';
          return null;
        },
      },
    } as unknown as Request;

    const headers = createDockerProxyHeaders(request);
    expect(headers['X-Recoder-Anonymous-Id']).toBe('anon_header_999');
  });

  it('resolves docker backend URL from cloudflare context first', () => {
    const url = getDockerBackendUrl({
      cloudflare: {
        env: {
          DOCKER_BACKEND_URL: 'http://docker-from-context:3100',
        },
      },
    });

    expect(url).toBe('http://docker-from-context:3100');
  });

  it('falls back to process DOCKER_URL when backend url env is absent', () => {
    vi.stubEnv('DOCKER_URL', 'http://docker-from-process:3200');
    vi.stubEnv('DOCKER_BACKEND_URL', '');
    vi.stubEnv('VITE_DOCKER_URL', '');
    vi.stubEnv('VITE_DOCKER_BACKEND_URL', '');

    const url = getDockerBackendUrl();
    expect(url).toBe('http://docker-from-process:3200');

    vi.unstubAllEnvs();
  });

  it('prefers process DOCKER_BACKEND_URL over DOCKER_URL when both are set', () => {
    vi.stubEnv('DOCKER_URL', 'http://localhost:3100');
    vi.stubEnv('DOCKER_BACKEND_URL', 'http://recoder-docker-backend:3100');
    vi.stubEnv('VITE_DOCKER_URL', '');
    vi.stubEnv('VITE_DOCKER_BACKEND_URL', '');

    const url = getDockerBackendUrl();
    expect(url).toBe('http://recoder-docker-backend:3100');

    vi.unstubAllEnvs();
  });

  it('prefers Authorization bearer token over cookie token for proxy headers', () => {
    const request = {
      headers: {
        get: (key: string) => {
          const normalized = key.toLowerCase();
          if (normalized === 'authorization') return 'Bearer header-token';
          if (normalized === 'cookie') return 'recoder.session_token=cookie-token';
          return null;
        },
      },
    } as unknown as Request;

    expect(getBearerOrSessionTokenFromRequest(request)).toBe('header-token');
    const headers = createDockerProxyHeaders(request);
    expect(headers.Authorization).toBe('Bearer header-token');
  });

  it('dockerFetchJson surfaces backend json error message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_request' }),
      text: async () => '',
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    await expect(dockerFetchJson('http://docker/api/test')).rejects.toThrow('invalid_request');
  });

  it('dockerFetchJson falls back to response text error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
      text: async () => 'backend down',
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    await expect(dockerFetchJson('http://docker/api/test')).rejects.toThrow('backend down');
  });
});
