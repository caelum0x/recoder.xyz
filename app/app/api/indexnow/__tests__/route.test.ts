import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function postRequest(body: unknown) {
  return new Request('https://recoder.xyz/api/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

const ORIGINAL_ENV = { ...process.env };

describe('POST /api/indexnow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.INDEXNOW_KEY;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('is a truthful no-op with 501 and makes NO network call when INDEXNOW_KEY is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { POST } = await import('../route');

    const res = await POST(postRequest({ urlList: ['https://recoder.xyz/pricing'] }));

    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json).toEqual({ submitted: false, reason: 'INDEXNOW_KEY not configured' });
    // Load-bearing: no fabricated ping, no submission claim.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(json.submitted).toBe(false);
  });

  it('builds the correct IndexNow payload and returns the upstream status when INDEXNOW_KEY is set', async () => {
    process.env.INDEXNOW_KEY = 'test-fake-key-not-real';

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const { POST } = await import('../route');
    const res = await POST(
      postRequest({
        urlList: ['https://recoder.xyz/pricing', 'https://recoder.xyz/features'],
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.indexnow.org/indexnow');
    expect(init.method).toBe('POST');

    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toEqual({
      host: 'recoder.xyz',
      key: 'test-fake-key-not-real',
      keyLocation: 'https://recoder.xyz/test-fake-key-not-real.txt',
      urlList: ['https://recoder.xyz/pricing', 'https://recoder.xyz/features'],
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ submitted: true, upstreamStatus: 200, urlCount: 2 });
  });

  it('reports submitted:false and the verbatim upstream status when IndexNow rejects', async () => {
    process.env.INDEXNOW_KEY = 'test-fake-key-not-real';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));

    const { POST } = await import('../route');
    const res = await POST(postRequest({ urlList: ['https://recoder.xyz/pricing'] }));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.submitted).toBe(false);
    expect(json.upstreamStatus).toBe(403);
  });

  it('rejects URLs that do not belong to the site host without calling IndexNow', async () => {
    process.env.INDEXNOW_KEY = 'test-fake-key-not-real';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { POST } = await import('../route');
    const res = await POST(
      postRequest({ urlList: ['https://evil.example.com/x', 'http://recoder.xyz/insecure'] }),
    );

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.submitted).toBe(false);
  });

  it('respects a NEXT_PUBLIC_SITE_URL origin override in host + keyLocation', async () => {
    process.env.INDEXNOW_KEY = 'test-fake-key-not-real';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.recoder.xyz';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const { POST } = await import('../route');
    await POST(postRequest({ urlList: ['https://staging.recoder.xyz/pricing'] }));

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.host).toBe('staging.recoder.xyz');
    expect(sentBody.keyLocation).toBe('https://staging.recoder.xyz/test-fake-key-not-real.txt');
  });
});
