import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --------------------------------------------------------------------------
// Mocks
// --------------------------------------------------------------------------

const mockVerifySession = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn((name: string) => {
      if (name === 'session_token') return { value: 'valid-token' };
      return undefined;
    }),
  }),
}));

vi.mock('@recoder/auth/verify', () => ({
  verifySession: (...args: unknown[]) => mockVerifySession(...args),
}));

vi.mock('@recoder/auth', () => ({
  authDatabase: {
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

describe('PATCH /api/user/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns profile for authenticated user after updating name', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'user-123' });

    const updatedUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'New Name',
      image: null,
      emailVerified: true,
    };
    mockUserUpdate.mockResolvedValue(updatedUser);

    const { PATCH } = await import('@/app/api/user/profile/route');

    const request = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user).toEqual(updatedUser);

    // Verify the DB was called with the right arguments
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-123' },
        data: { name: 'New Name' },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          emailVerified: true,
        },
      }),
    );
  });

  it('updates image field', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'user-456' });

    const updatedUser = {
      id: 'user-456',
      email: 'img@example.com',
      name: 'Img User',
      image: 'https://example.com/new-avatar.png',
      emailVerified: true,
    };
    mockUserUpdate.mockResolvedValue(updatedUser);

    const { PATCH } = await import('@/app/api/user/profile/route');

    const request = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: 'https://example.com/new-avatar.png' }),
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user.image).toBe('https://example.com/new-avatar.png');

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { image: 'https://example.com/new-avatar.png' },
      }),
    );
  });

  it('rejects request with no valid profile fields', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'user-123' });

    const { PATCH } = await import('@/app/api/user/profile/route');

    const request = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('No profile fields to update');
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid field types (number for name) with 400', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'user-123' });

    const { PATCH } = await import('@/app/api/user/profile/route');

    // A number is not a valid string — sanitizeName returns undefined,
    // so updateData will be empty, resulting in 400
    const request = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 12345 }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('returns 401 for unauthenticated request', async () => {
    mockVerifySession.mockResolvedValue(null);

    const { PATCH } = await import('@/app/api/user/profile/route');

    const request = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Hacker' }),
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('trims and truncates name to 120 characters', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'user-789' });

    const longName = 'A'.repeat(200);
    const expectedName = 'A'.repeat(120);

    mockUserUpdate.mockResolvedValue({
      id: 'user-789',
      email: 'long@example.com',
      name: expectedName,
      image: null,
      emailVerified: true,
    });

    const { PATCH } = await import('@/app/api/user/profile/route');

    const request = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: `  ${longName}  ` }),
    });

    await PATCH(request);

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: expectedName },
      }),
    );
  });

  it('sets name to null when given empty string', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'user-abc' });

    mockUserUpdate.mockResolvedValue({
      id: 'user-abc',
      email: 'nullname@example.com',
      name: null,
      image: null,
      emailVerified: true,
    });

    const { PATCH } = await import('@/app/api/user/profile/route');

    const request = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: null },
      }),
    );
  });

  it('handles malformed JSON body gracefully', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'user-bad' });

    const { PATCH } = await import('@/app/api/user/profile/route');

    const request = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });

    const response = await PATCH(request);

    // Malformed JSON falls back to {} via .catch(() => ({})), resulting in no fields
    expect(response.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
