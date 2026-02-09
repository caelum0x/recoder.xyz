import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDatabase, mockVerifySession, mockGetPaddleClient, mockGetDodoPayClient } = vi.hoisted(() => ({
  mockGetDatabase: vi.fn(),
  mockVerifySession: vi.fn(),
  mockGetPaddleClient: vi.fn(),
  mockGetDodoPayClient: vi.fn(),
}));

vi.mock('~/lib/.server/db/client', () => ({
  getDatabase: mockGetDatabase,
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

vi.mock('~/lib/.server/payment/paddle', () => ({
  getPaddleClient: mockGetPaddleClient,
}));

vi.mock('~/lib/.server/payment/dodopay', () => ({
  getDodoPayClient: mockGetDodoPayClient,
}));

import { action as subscribeAction, loader as subscribeLoader } from './api.subscribe';

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

async function readJsonBody(response: any): Promise<any> {
  if (typeof response?.json === 'function') return response.json();
  if (response?.data) return response.data;
  if (response?.body) return JSON.parse(response.body);
  return response;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
describe('api.subscribe authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loader returns 401 when session is missing', async () => {
    mockVerifySession.mockResolvedValueOnce(null);

    const request = {
      method: 'GET',
      url: 'http://localhost/api/subscribe',
      headers: new Headers(),
    } as any;

    const response = await subscribeLoader({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(401);
  });

  it('action returns 401 when session is missing', async () => {
    mockVerifySession.mockResolvedValueOnce(null);

    const request = {
      method: 'POST',
      url: 'http://localhost/api/subscribe?action=create-checkout',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ planId: 'pro' }),
    } as any;

    const response = await subscribeAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(401);
    expect(mockGetDatabase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Write-action gating (BILLING_ACTIONS_ENABLED)
// ---------------------------------------------------------------------------
describe('api.subscribe write-action gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BILLING_ACTIONS_ENABLED', '');
    mockVerifySession.mockResolvedValue({ user: { id: 'u1', email: 'u1@test.com' } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 for write actions when billing writes are disabled in non-production', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const request = {
      method: 'POST',
      url: 'http://localhost/api/subscribe?action=create-checkout',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ planId: 'pro' }),
    } as any;

    const response = await subscribeAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(503);
    expect(mockGetDatabase).not.toHaveBeenCalled();
  });

  it('returns 404 for write actions when disabled in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const request = {
      method: 'POST',
      url: 'http://localhost/api/subscribe?action=create-checkout',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ planId: 'pro' }),
    } as any;

    const response = await subscribeAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(404);
    expect(mockGetDatabase).not.toHaveBeenCalled();
  });

  it('returns 400 for unknown action type', async () => {
    vi.stubEnv('BILLING_ACTIONS_ENABLED', 'true');

    const request = {
      method: 'POST',
      url: 'http://localhost/api/subscribe?action=unknown-action',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({}),
    } as any;

    const response = await subscribeAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// SSRF protection on billing portal URLs
// ---------------------------------------------------------------------------
describe('api.subscribe SSRF protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BILLING_ACTIONS_ENABLED', 'true');
    mockVerifySession.mockResolvedValue({ user: { id: 'u1', email: 'u1@test.com' } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts portal URL on allowed domain (paddle.com)', async () => {
    const mockPaddle = {
      createBillingPortalSession: vi.fn().mockResolvedValueOnce({
        url: 'https://customer-portal.paddle.com/session/abc123',
      }),
    };
    mockGetPaddleClient.mockReturnValueOnce(mockPaddle);

    const request = {
      method: 'POST',
      url: 'http://localhost/api/subscribe?action=create-portal',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ customerId: 'cust_1', provider: 'paddle' }),
    } as any;

    const response = await subscribeAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(200);
    const body = await readJsonBody(response);
    expect(body.portalUrl).toBe('https://customer-portal.paddle.com/session/abc123');
  });

  it('rejects portal URL on disallowed domain', async () => {
    const mockPaddle = {
      createBillingPortalSession: vi.fn().mockResolvedValueOnce({
        url: 'https://evil-site.com/steal-creds',
      }),
    };
    mockGetPaddleClient.mockReturnValueOnce(mockPaddle);

    const request = {
      method: 'POST',
      url: 'http://localhost/api/subscribe?action=create-portal',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ customerId: 'cust_1', provider: 'paddle' }),
    } as any;

    const response = await subscribeAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(502);
    const body = await readJsonBody(response);
    expect(body.error).toContain('unexpected URL');
  });

  it('rejects portal URL with http:// protocol', async () => {
    const mockPaddle = {
      createBillingPortalSession: vi.fn().mockResolvedValueOnce({
        url: 'http://paddle.com/portal/abc',
      }),
    };
    mockGetPaddleClient.mockReturnValueOnce(mockPaddle);

    const request = {
      method: 'POST',
      url: 'http://localhost/api/subscribe?action=create-portal',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ customerId: 'cust_1', provider: 'paddle' }),
    } as any;

    const response = await subscribeAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(502);
  });

  it('rejects portal URL with domain suffix attack (e.g., notpaddle.com)', async () => {
    const mockPaddle = {
      createBillingPortalSession: vi.fn().mockResolvedValueOnce({
        url: 'https://notpaddle.com/steal',
      }),
    };
    mockGetPaddleClient.mockReturnValueOnce(mockPaddle);

    const request = {
      method: 'POST',
      url: 'http://localhost/api/subscribe?action=create-portal',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ customerId: 'cust_1', provider: 'paddle' }),
    } as any;

    const response = await subscribeAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(502);
  });

  it('accepts dodopayments.com portal URL', async () => {
    const mockDodoPay = {
      createBillingPortalSession: vi.fn().mockResolvedValueOnce({
        url: 'https://portal.dodopayments.com/session/xyz',
      }),
    };
    mockGetDodoPayClient.mockReturnValueOnce(mockDodoPay);

    const request = {
      method: 'POST',
      url: 'http://localhost/api/subscribe?action=create-portal',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ customerId: 'cust_1', provider: 'dodopay' }),
    } as any;

    const response = await subscribeAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(200);
    const body = await readJsonBody(response);
    expect(body.portalUrl).toBe('https://portal.dodopayments.com/session/xyz');
  });

  it('returns 400 when customerId or provider is missing', async () => {
    const request = {
      method: 'POST',
      url: 'http://localhost/api/subscribe?action=create-portal',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ provider: 'paddle' }),
    } as any;

    const response = await subscribeAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(400);
  });

  it('returns 400 for unsupported provider', async () => {
    const request = {
      method: 'POST',
      url: 'http://localhost/api/subscribe?action=create-portal',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ customerId: 'cust_1', provider: 'stripe' }),
    } as any;

    const response = await subscribeAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(400);
  });
});
