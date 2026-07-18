// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  fetchBackendSession,
  isBackendSeamEnabled,
} from '@/lib/auth-backend-seam';

const COOKIE = 'recoder.session_token=abc.def';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe('isBackendSeamEnabled', () => {
  it('is off when the flag is unset', () => {
    expect(isBackendSeamEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('accepts 1/true/on (case-insensitive)', () => {
    for (const v of ['1', 'true', 'TRUE', 'on', 'On']) {
      expect(
        isBackendSeamEnabled({ RECODER_AUTH_BACKEND_SEAM: v } as unknown as NodeJS.ProcessEnv),
      ).toBe(true);
    }
  });

  it('rejects other values', () => {
    expect(
      isBackendSeamEnabled({ RECODER_AUTH_BACKEND_SEAM: 'no' } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe('fetchBackendSession', () => {
  const enabledEnv = { RECODER_AUTH_BACKEND_SEAM: '1' } as unknown as NodeJS.ProcessEnv;

  it('returns null and never calls fetch when the flag is off', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchBackendSession(COOKIE, {
      env: {} as NodeJS.ProcessEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null when there is no cookie header', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchBackendSession(null, {
      env: enabledEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a valid Better Auth get-session body', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        session: { expiresAt: '2030-01-01T00:00:00.000Z' },
        user: { id: 'u1', email: 'a@b.com', name: 'Ada', image: 'x.png' },
      }),
    );
    const result = await fetchBackendSession(COOKIE, {
      env: enabledEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      user: { id: 'u1', email: 'a@b.com', name: 'Ada', image: 'x.png' },
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    // Cookie must be forwarded to the backend authority.
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ cookie: COOKIE });
  });

  it('derives a name from email when the backend omits one', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        session: { expiresAt: '2030-01-01T00:00:00.000Z' },
        user: { id: 'u1', email: 'solo@b.com' },
      }),
    );
    const result = await fetchBackendSession(COOKIE, {
      env: enabledEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result?.user.name).toBe('solo');
    expect(result?.user.image).toBeNull();
  });

  it('returns null for an anonymous/null body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse('null'));
    const result = await fetchBackendSession(COOKIE, {
      env: enabledEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it('returns null when the session has no expiry (not a real session)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ user: { id: 'u1', email: 'a@b.com' } }),
    );
    const result = await fetchBackendSession(COOKIE, {
      env: enabledEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it('returns null (falls back) on a non-OK backend response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse('', false, 503));
    const result = await fetchBackendSession(COOKIE, {
      env: enabledEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it('returns null (never throws) when the backend is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await fetchBackendSession(COOKIE, {
      env: enabledEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse('{not json'));
    const result = await fetchBackendSession(COOKIE, {
      env: enabledEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });
});
