// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pollDeviceCode: vi.fn(),
  refreshAccessToken: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/services/cli-auth.service', () => ({
  CLIAuthService: {
    pollDeviceCode: mocks.pollDeviceCode,
    refreshAccessToken: mocks.refreshAccessToken,
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

import { POST } from '@/app/api/auth/cli/token/route';

function makeRequest(payload: Record<string, unknown>) {
  return new Request('https://recoder.xyz/api/auth/cli/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }) as any;
}

describe('POST /api/auth/cli/token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns authorization_pending when device flow is still pending', async () => {
    mocks.pollDeviceCode.mockResolvedValueOnce({ status: 'pending' });

    const response = await POST(
      makeRequest({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: 'dev_123',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'authorization_pending',
      status: 'pending',
    });
  });

  it('returns device-flow tokens when authorized', async () => {
    mocks.pollDeviceCode.mockResolvedValueOnce({
      status: 'authorized',
      access_token: 'reco_access',
      refresh_token: 'recr_refresh',
      expires_in: 7776000,
      user: { id: 'u1', email: 'a@b.c' },
    });

    const response = await POST(
      makeRequest({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: 'dev_456',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'authorized',
      access_token: 'reco_access',
      refresh_token: 'recr_refresh',
    });
  });

  it('maps invalid device code errors to invalid_grant', async () => {
    mocks.pollDeviceCode.mockRejectedValueOnce(new Error('Invalid device code'));

    const response = await POST(
      makeRequest({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: 'bad_code',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_grant' });
  });

  it('returns refreshed token payload and echoes refresh_token', async () => {
    mocks.refreshAccessToken.mockResolvedValueOnce({
      access_token: 'reco_new',
      token_type: 'Bearer',
      expires_in: 7776000,
    });

    const response = await POST(
      makeRequest({
        grant_type: 'refresh_token',
        refresh_token: 'recr_old',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      access_token: 'reco_new',
      token_type: 'Bearer',
      expires_in: 7776000,
      refresh_token: 'recr_old',
    });
  });

  it('returns unsupported_grant_type for unknown grant values', async () => {
    const response = await POST(
      makeRequest({
        grant_type: 'client_credentials',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'unsupported_grant_type',
    });
  });
});
