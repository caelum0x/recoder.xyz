import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const ADMIN_SECRET = 'test-admin-secret-value-1234567890';
const DEFAULT_KEY = 'fc855a24fb8ed402c70b39f17fe8b444';

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://recoder.xyz/api/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as never;
}

/** Authenticated request via the admin-secret header. */
function authedRequest(body: unknown) {
  return postRequest(body, { 'x-admin-secret': ADMIN_SECRET });
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
    delete process.env.INTERNAL_SERVICE_KEY;
    process.env.ADMIN_SECRET = ADMIN_SECRET;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('rejects an unauthenticated request with 401 and makes NO network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { POST } = await import('../route');

    const res = await POST(postRequest({ urls: ['https://recoder.xyz/pricing'] }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.submitted).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submits with the committed default key when INDEXNOW_KEY is unset', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const { POST } = await import('../route');
    const res = await POST(
      authedRequest({ urls: ['https://recoder.xyz/pricing', 'https://recoder.xyz/features'] }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.indexnow.org/indexnow');
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toEqual({
      host: 'recoder.xyz',
      key: DEFAULT_KEY,
      keyLocation: `https://recoder.xyz/${DEFAULT_KEY}.txt`,
      urlList: ['https://recoder.xyz/pricing', 'https://recoder.xyz/features'],
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ submitted: true, upstreamStatus: 200, urlCount: 2 });
  });

  it('prefers a valid INDEXNOW_KEY env override (rotation)', async () => {
    process.env.INDEXNOW_KEY = 'rotated-key-abcdef123456';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const { POST } = await import('../route');
    await POST(authedRequest({ urls: ['https://recoder.xyz/pricing'] }));

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.key).toBe('rotated-key-abcdef123456');
    expect(sentBody.keyLocation).toBe('https://recoder.xyz/rotated-key-abcdef123456.txt');
  });

  it('accepts the legacy `urlList` field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const { POST } = await import('../route');
    const res = await POST(authedRequest({ urlList: ['https://recoder.xyz/pricing'] }));
    expect(res.status).toBe(200);
  });

  it('reports submitted:false and the verbatim upstream status when IndexNow rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));

    const { POST } = await import('../route');
    const res = await POST(authedRequest({ urls: ['https://recoder.xyz/pricing'] }));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.submitted).toBe(false);
    expect(json.upstreamStatus).toBe(403);
  });

  it('rejects URLs that do not belong to the site host without calling IndexNow', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { POST } = await import('../route');
    const res = await POST(
      authedRequest({ urls: ['https://evil.example.com/x', 'http://recoder.xyz/insecure'] }),
    );

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.submitted).toBe(false);
  });

  it('rejects an empty body with 400 (zod validation)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { POST } = await import('../route');
    const res = await POST(authedRequest({}));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('respects a NEXT_PUBLIC_SITE_URL origin override in host + keyLocation', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.recoder.xyz';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const { POST } = await import('../route');
    await POST(authedRequest({ urls: ['https://staging.recoder.xyz/pricing'] }));

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.host).toBe('staging.recoder.xyz');
    expect(sentBody.keyLocation).toBe(`https://staging.recoder.xyz/${DEFAULT_KEY}.txt`);
  });
});
