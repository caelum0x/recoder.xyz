// @vitest-environment node
/**
 * Unsubscribe route tests — the legally load-bearing opt-out path for winback
 * recipients (KVKK/CAN-SPAM):
 *  - GET never mutates (safe against mail-scanner link prefetch) and renders a
 *    confirm page for validly signed links, even with NO subscriber row,
 *  - POST creates a suppression row for non-subscribers ONLY with a valid
 *    signature (no arbitrary-email suppression), and still unsubscribes
 *    existing subscribers by email/token as before.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: {
    newsletter_subscribers: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    users: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

// The rate limiter is exercised separately in public-post-rate-limits.test.ts;
// here it must not interfere (it would need a live DB).
vi.mock('@/lib/middleware/rate-limit', () => ({
  rateLimit: () => async () => null,
  rateLimitConfigs: { public: { windowMs: 60000, maxRequests: 100 } },
}));

const SECRET_KEY = 'UNSUBSCRIBE_TOKEN_SECRET';
const savedSecret = process.env[SECRET_KEY];

beforeAll(() => {
  process.env[SECRET_KEY] = 'test-secret-for-unsubscribe-tokens';
});

afterAll(() => {
  if (savedSecret === undefined) delete process.env[SECRET_KEY];
  else process.env[SECRET_KEY] = savedSecret;
});

async function loadRoute() {
  return import('@/app/api/newsletter/unsubscribe/route');
}

async function signatureFor(email: string): Promise<string> {
  const { generateUnsubscribeSignature } = await import('@/lib/email/unsubscribe-token');
  const sig = generateUnsubscribeSignature(email);
  if (!sig) throw new Error('test secret not configured');
  return sig;
}

function jsonPost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/newsletter/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function formPost(fields: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/newsletter/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

function getRequest(params: Record<string, string>): NextRequest {
  const qs = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost/api/newsletter/unsubscribe?${qs}`, {
    method: 'GET',
    headers: { accept: 'text/html,application/xhtml+xml' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.newsletter_subscribers.findUnique.mockResolvedValue(null);
  mocks.prisma.newsletter_subscribers.findFirst.mockResolvedValue(null);
  mocks.prisma.newsletter_subscribers.update.mockResolvedValue({});
  mocks.prisma.newsletter_subscribers.upsert.mockResolvedValue({});
  mocks.prisma.users.findUnique.mockResolvedValue(null);
});

describe('POST /api/newsletter/unsubscribe', () => {
  it('creates a suppression row for a non-subscriber with a valid signature', async () => {
    const { POST } = await loadRoute();
    const email = 'dormant@example.com';
    const sig = await signatureFor(email);
    mocks.prisma.users.findUnique.mockResolvedValue({ id: 'u1' });

    const res = await POST(jsonPost({ email, sig }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mocks.prisma.newsletter_subscribers.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mocks.prisma.newsletter_subscribers.upsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({ email });
    expect(upsertArgs.create).toEqual(
      expect.objectContaining({
        email,
        status: 'unsubscribed',
        userId: 'u1',
        unsubscribedAt: expect.any(Date),
      }),
    );
    expect(upsertArgs.update).toEqual(
      expect.objectContaining({ status: 'unsubscribed' }),
    );
  });

  it('rejects a non-subscriber unsubscribe with a BAD signature (no suppression row)', async () => {
    const { POST } = await loadRoute();
    const sig = await signatureFor('attacker-signed-other@example.com');

    const res = await POST(jsonPost({ email: 'victim@example.com', sig }));

    expect(res.status).toBe(404);
    expect(mocks.prisma.newsletter_subscribers.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.newsletter_subscribers.update).not.toHaveBeenCalled();
  });

  it('rejects a non-subscriber unsubscribe with NO signature', async () => {
    const { POST } = await loadRoute();

    const res = await POST(jsonPost({ email: 'victim@example.com' }));

    expect(res.status).toBe(404);
    expect(mocks.prisma.newsletter_subscribers.upsert).not.toHaveBeenCalled();
  });

  it('still unsubscribes an existing subscriber by email (legacy path)', async () => {
    const { POST } = await loadRoute();
    mocks.prisma.newsletter_subscribers.findFirst.mockResolvedValue({
      id: 'sub1',
      email: 'subscriber@example.com',
      name: 'Sub',
      status: 'active',
      userId: null,
    });

    const res = await POST(jsonPost({ email: 'subscriber@example.com' }));

    expect(res.status).toBe(200);
    expect(mocks.prisma.newsletter_subscribers.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub1' },
        data: expect.objectContaining({ status: 'unsubscribed' }),
      }),
    );
  });

  it('form POST from the confirm page unsubscribes and returns an HTML done page', async () => {
    const { POST } = await loadRoute();
    const email = 'dormant@example.com';
    const sig = await signatureFor(email);

    const res = await POST(formPost({ email, sig }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain("You're unsubscribed");
    expect(mocks.prisma.newsletter_subscribers.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid email input', async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonPost({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/newsletter/unsubscribe', () => {
  it('renders the confirm page for a validly signed link with NO subscriber row, without mutating', async () => {
    const { GET } = await loadRoute();
    const email = 'dormant@example.com';
    const sig = await signatureFor(email);

    const res = await GET(getRequest({ email, sig }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    // A confirm form that POSTs — GET itself must never unsubscribe.
    expect(html).toContain('method="post"');
    expect(html).toContain(email);
    expect(html).toContain(`value="${sig}"`);
    expect(mocks.prisma.newsletter_subscribers.update).not.toHaveBeenCalled();
    expect(mocks.prisma.newsletter_subscribers.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.newsletter_subscribers.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 for a bad signature when no subscriber row exists', async () => {
    const { GET } = await loadRoute();

    const res = await GET(getRequest({ email: 'victim@example.com', sig: 'forged' }));

    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('not valid');
  });

  it('still renders the confirm page for an existing subscriber via plain email link', async () => {
    const { GET } = await loadRoute();
    mocks.prisma.newsletter_subscribers.findFirst.mockResolvedValue({
      id: 'sub1',
      email: 'subscriber@example.com',
      name: 'Sub',
      status: 'active',
      userId: null,
    });

    const res = await GET(getRequest({ email: 'subscriber@example.com' }));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('method="post"');
  });

  it('escapes the email when rendering the page', async () => {
    const { GET } = await loadRoute();
    // Zod rejects emails with raw quotes/angle brackets, so this exercises the
    // invalid-input path — the raw value must never be reflected unescaped.
    const res = await GET(getRequest({ email: '"><script>alert(1)</script>@x.com' }));
    const html = await res.text();
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
