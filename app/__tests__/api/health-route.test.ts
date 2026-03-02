import { NextRequest } from 'next/server';

const mockTraceRequest = vi.fn();

vi.mock('@/lib/tracing-middleware', () => ({
  traceRequest: (...args: unknown[]) => mockTraceRequest(...args),
}));

describe('/api/health route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Default mock: traceRequest returns a traceId and passthrough applyTraceId
    mockTraceRequest.mockReturnValue({
      traceId: 'test-trace-id-abc123',
      applyTraceId: (response: Response) => response,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
  });

  function req(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(url, init);
  }

  it('returns 200 with healthy status', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(req('http://localhost/api/health'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe('healthy');
  });

  it('returns correct service name', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(req('http://localhost/api/health'));
    const json = await response.json();

    expect(json.service).toBe('recoder-api');
  });

  it('includes all required fields in response', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(req('http://localhost/api/health'));
    const json = await response.json();

    expect(json).toHaveProperty('status');
    expect(json).toHaveProperty('service');
    expect(json).toHaveProperty('timestamp');
    expect(json).toHaveProperty('version');
    expect(json).toHaveProperty('traceId');
    expect(json).toHaveProperty('endpoints');
  });

  it('returns a valid ISO timestamp', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(req('http://localhost/api/health'));
    const json = await response.json();

    const parsed = new Date(json.timestamp);
    expect(parsed.toISOString()).toBe(json.timestamp);
  });

  it('returns version 1.0.0', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(req('http://localhost/api/health'));
    const json = await response.json();

    expect(json.version).toBe('1.0.0');
  });

  it('returns the traceId from traceRequest', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(req('http://localhost/api/health'));
    const json = await response.json();

    expect(json.traceId).toBe('test-trace-id-abc123');
  });

  it('returns the expected endpoints object', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(req('http://localhost/api/health'));
    const json = await response.json();

    expect(json.endpoints).toEqual({
      ai: '/api/ai/chat',
      auth: '/api/auth/login',
      health: '/api/health',
    });
  });

  it('calls traceRequest with the incoming request', async () => {
    const { GET } = await import('@/app/api/health/route');
    const request = req('http://localhost/api/health');
    await GET(request);

    expect(mockTraceRequest).toHaveBeenCalledTimes(1);
    expect(mockTraceRequest).toHaveBeenCalledWith(request);
  });
});
