import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 200 with status "ok"', async () => {
    const { GET } = await import('@/app/api/health/route');

    const response = await GET();

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('includes service name "recoder-agents"', async () => {
    const { GET } = await import('@/app/api/health/route');

    const response = await GET();
    const body = await response.json();

    expect(body.service).toBe('recoder-agents');
  });

  it('includes a valid ISO timestamp', async () => {
    const fixedDate = new Date('2026-03-06T12:00:00.000Z');
    vi.setSystemTime(fixedDate);

    const { GET } = await import('@/app/api/health/route');

    const response = await GET();
    const body = await response.json();

    expect(body.timestamp).toBe('2026-03-06T12:00:00.000Z');

    // Verify it's a valid ISO string
    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });

  it('returns all expected fields in the response', async () => {
    const { GET } = await import('@/app/api/health/route');

    const response = await GET();
    const body = await response.json();

    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('service');
    expect(body).toHaveProperty('timestamp');
    // Should contain exactly these three fields
    expect(Object.keys(body)).toHaveLength(3);
  });
});
