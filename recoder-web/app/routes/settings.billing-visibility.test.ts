import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader as settingsLoader } from './settings';
import { loader as billingLoader } from './settings.billing';

async function readJsonBody(response: any): Promise<any> {
  if (typeof response?.json === 'function') {
    return response.json();
  }
  if (response?.data) {
    return response.data;
  }
  if (response?.body) {
    return JSON.parse(response.body);
  }
  return response;
}

describe('settings billing visibility loaders', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides billing nav in production when billing actions are disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BILLING_ACTIONS_ENABLED', '');

    const response = await settingsLoader({ context: {} as any, request: {} as any, params: {} as any } as any);
    const body = await readJsonBody(response);

    expect(body.billingVisible).toBe(false);
  });

  it('shows billing nav in production when billing actions are enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BILLING_ACTIONS_ENABLED', 'true');

    const response = await settingsLoader({ context: {} as any, request: {} as any, params: {} as any } as any);
    const body = await readJsonBody(response);

    expect(body.billingVisible).toBe(true);
  });

  it('enables readOnly billing mode in production when billing actions are disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BILLING_ACTIONS_ENABLED', '');

    const response = await billingLoader({ context: {} as any, request: {} as any, params: {} as any } as any);
    const body = await readJsonBody(response);

    expect(body.billingActionsEnabled).toBe(false);
    expect(body.readOnlyMode).toBe(true);
  });

  it('disables readOnly billing mode when billing actions are enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BILLING_ACTIONS_ENABLED', 'true');

    const response = await billingLoader({ context: {} as any, request: {} as any, params: {} as any } as any);
    const body = await readJsonBody(response);

    expect(body.billingActionsEnabled).toBe(true);
    expect(body.readOnlyMode).toBe(false);
  });
});
