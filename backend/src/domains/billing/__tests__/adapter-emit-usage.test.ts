/**
 * emitUsage push-failure contract (billing-provider.port.ts §74-76):
 * a push error MUST propagate so metering.service.flushOnce leaves events
 * unflushed (never `markFlushed`). The pre-try no-op guards (credential absent /
 * empty batch) must still early-return without touching the network or throwing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../shared/errors.js';
import { sliceBillingConfig } from '../config.js';
import { createPlanCatalog } from '../services/plan-catalog.service.js';
import { createPolarAdapter } from '../adapters/polar.adapter.js';
import { createDodoAdapter } from '../adapters/dodo.adapter.js';
import type { BillingProviderPort } from '../ports/billing-provider.port.js';
import type { MeterEvent } from '../types.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<
  typeof sliceBillingConfig
>[0];

const EVENT: MeterEvent = {
  subjectId: 'u1',
  kind: 'agent_run',
  quantity: 1,
  idempotencyKey: 'k1',
  timestamp: '2026-01-01T00:00:00.000Z',
};

type Factory = (deps: Parameters<typeof createPolarAdapter>[0]) => BillingProviderPort;

function adapterFor(factory: Factory, provider: 'polar' | 'dodo', apiKey: string | null) {
  const config = sliceBillingConfig(appConfig, { [provider]: { apiKey } });
  return factory({ credential: config[provider], catalog: createPlanCatalog(config) });
}

const CASES: ReadonlyArray<{ name: 'polar' | 'dodo'; factory: Factory }> = [
  { name: 'polar', factory: createPolarAdapter },
  { name: 'dodo', factory: createDodoAdapter },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(CASES)('%s.emitUsage — push failure propagates (undercharge guard)', ({ name, factory }) => {
  it('propagates a provider push error so flushOnce would NOT markFlushed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ detail: 'meter feed unavailable' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = adapterFor(factory, name, 'sk_test_key');
    await expect(adapter.emitUsage([EVENT])).rejects.toBeInstanceOf(AppError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still no-ops (no throw, no network) when the credential is absent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const adapter = adapterFor(factory, name, null);
    await expect(adapter.emitUsage([EVENT])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still no-ops (no throw, no network) when the batch is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const adapter = adapterFor(factory, name, 'sk_test_key');
    await expect(adapter.emitUsage([])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
