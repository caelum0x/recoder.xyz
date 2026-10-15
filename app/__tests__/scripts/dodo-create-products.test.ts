import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createProduct,
  listExistingProducts,
  resolveApiKey,
  resolveBaseUrl,
  syncDodoProducts,
} from '../../scripts/dodo-create-products';

function fakeFetch(
  handler: (url: string, init: RequestInit) => { status: number; body: unknown },
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const { status, body } = handler(String(input), init ?? {});
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveApiKey', () => {
  it('reads DODO_API_KEY_TEST in test mode', () => {
    vi.stubEnv('DODO_API_KEY_TEST', 'test_key');
    vi.stubEnv('DODO_API_KEY_LIVE', 'live_key');
    expect(resolveApiKey(true)).toBe('test_key');
  });

  it('reads DODO_API_KEY_LIVE (falls back to DODO_PAYMENTS_API_KEY) in live mode', () => {
    vi.stubEnv('DODO_API_KEY_LIVE', 'live_key');
    expect(resolveApiKey(false)).toBe('live_key');

    vi.stubEnv('DODO_API_KEY_LIVE', '');
    vi.stubEnv('DODO_PAYMENTS_API_KEY', 'legacy_key');
    expect(resolveApiKey(false)).toBe('legacy_key');
  });

  it('returns null (never a fabricated key) when nothing is configured', () => {
    vi.stubEnv('DODO_API_KEY_TEST', '');
    vi.stubEnv('DODO_API_KEY_LIVE', '');
    vi.stubEnv('DODO_PAYMENTS_API_KEY', '');
    expect(resolveApiKey(true)).toBeNull();
    expect(resolveApiKey(false)).toBeNull();
  });
});

describe('resolveBaseUrl', () => {
  it('defaults to api.dodopayments.com', () => {
    vi.stubEnv('DODO_API_BASE_URL', '');
    expect(resolveBaseUrl()).toBe('https://api.dodopayments.com');
  });

  it('honors an explicit DODO_API_BASE_URL override', () => {
    vi.stubEnv('DODO_API_BASE_URL', 'https://test.dodopayments.com');
    expect(resolveBaseUrl()).toBe('https://test.dodopayments.com');
  });
});

describe('listExistingProducts / createProduct', () => {
  it('lists products from the configured base URL with bearer auth', async () => {
    let capturedUrl = '';
    let capturedAuth = '';
    const fetchImpl = fakeFetch((url, init) => {
      capturedUrl = url;
      capturedAuth = (init.headers as Record<string, string>).Authorization;
      return { status: 200, body: { items: [{ product_id: 'pdt_1', name: 'Recoder Pro' }] } };
    });
    const items = await listExistingProducts('https://api.dodopayments.com', 'sk_live_x', fetchImpl);
    expect(capturedUrl).toBe('https://api.dodopayments.com/products');
    expect(capturedAuth).toBe('Bearer sk_live_x');
    expect(items).toEqual([{ product_id: 'pdt_1', name: 'Recoder Pro' }]);
  });

  it('listExistingProducts throws (never silently empty) on a non-OK response', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 401, body: { message: 'bad key' } }));
    await expect(listExistingProducts('https://api.dodopayments.com', 'bad', fetchImpl)).rejects.toThrow(
      /HTTP 401/,
    );
  });

  it('createProduct posts the correct recurring-price shape', async () => {
    let capturedBody: Record<string, unknown> = {};
    const fetchImpl = fakeFetch((_url, init) => {
      capturedBody = JSON.parse(init.body as string);
      return { status: 200, body: { product_id: 'pdt_new' } };
    });
    const id = await createProduct(
      'https://api.dodopayments.com',
      'sk_live_x',
      {
        envVar: 'DODO_PRODUCT_TEAM',
        name: 'Recoder Team',
        description: 'd',
        priceCents: 9900,
        interval: 'month',
      },
      fetchImpl,
    );
    expect(id).toBe('pdt_new');
    expect(capturedBody.name).toBe('Recoder Team');
    expect((capturedBody.price as Record<string, unknown>).price).toBe(9900);
    expect((capturedBody.price as Record<string, unknown>).payment_frequency_interval).toBe('Month');
  });
});

describe('syncDodoProducts', () => {
  it('is idempotent: skips an already-existing product, creates the missing ones', async () => {
    const logs: string[] = [];
    let createCalls = 0;
    const fetchImpl = fakeFetch((_url, init) => {
      if (init.method === undefined) {
        // GET /products (no method set) — "Recoder Pro" already exists, the other two do not.
        return { status: 200, body: { items: [{ product_id: 'pdt_existing_pro', name: 'Recoder Pro' }] } };
      }
      createCalls += 1;
      return { status: 200, body: { product_id: `pdt_created_${createCalls}` } };
    });

    const results = await syncDodoProducts('https://api.dodopayments.com', 'sk_live_x', (m) => logs.push(m), fetchImpl);

    expect(results.DODO_PRODUCT_PRO).toBe('pdt_existing_pro');
    expect(results.DODO_PRODUCT_PRO_ANNUAL).toBe('pdt_created_1');
    expect(results.DODO_PRODUCT_TEAM).toBe('pdt_created_2');
    expect(logs.some((l) => l.includes('[skip] "Recoder Pro"'))).toBe(true);
    expect(logs.some((l) => l.includes('[created] "Recoder Pro (Annual)"'))).toBe(true);
    expect(logs.some((l) => l.includes('[created] "Recoder Team"'))).toBe(true);
    expect(createCalls).toBe(2);
  });

  it('a second run against the same (now fully populated) product list creates nothing', async () => {
    const fetchImpl = fakeFetch((_url, init) => {
      if (init.method === 'POST') throw new Error('should never POST — everything already exists');
      return {
        status: 200,
        body: {
          items: [
            { product_id: 'pdt_pro', name: 'Recoder Pro' },
            { product_id: 'pdt_pro_annual', name: 'Recoder Pro (Annual)' },
            { product_id: 'pdt_team', name: 'Recoder Team' },
          ],
        },
      };
    });

    const results = await syncDodoProducts('https://api.dodopayments.com', 'sk_live_x', () => {}, fetchImpl);
    expect(results).toEqual({
      DODO_PRODUCT_PRO: 'pdt_pro',
      DODO_PRODUCT_PRO_ANNUAL: 'pdt_pro_annual',
      DODO_PRODUCT_TEAM: 'pdt_team',
    });
  });
});
