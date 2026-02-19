/**
 * Cross-domain session sync receiver for recoder-web (Bolt IDE)
 *
 * Receives JWT sync tokens from recoder.xyz (main app) and sets a
 * cross-domain cookie so users don't need to sign in separately.
 *
 * - loader  (GET):    Check if a sync cookie exists and is valid
 * - action  (POST):   Receive a Bearer token, verify JWT, set sync cookie
 * - action  (DELETE):  Clear the sync cookie (logout propagation)
 */

import { type LoaderFunctionArgs, type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { jwtVerify } from 'jose';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AuthSync');

const SYNC_COOKIE_NAME = 'recoder-session-sync';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function getSyncSecret(): string | undefined {
  return (
    process.env.SESSION_SYNC_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET
  );
}

async function verifyToken(token: string, secret: string) {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey);
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...rest] = c.trim().split('=');
      return [key, rest.join('=')];
    }),
  );
}

function buildSetCookie(name: string, value: string, maxAge: number): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    `Domain=.recoder.xyz`,
    'HttpOnly',
    'SameSite=None',
    `Max-Age=${maxAge}`,
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

// ── loader (GET) — check sync status ──────────────────────────────────
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const cookies = parseCookies(request.headers.get('Cookie'));
    const cookieToken = cookies[SYNC_COOKIE_NAME];

    if (!cookieToken) {
      return json({ synced: false, sessionData: null, timestamp: Date.now() });
    }

    const secret = getSyncSecret();

    if (!secret) {
      return json({ synced: false, sessionData: null, timestamp: Date.now() });
    }

    const payload = await verifyToken(cookieToken, secret);

    if (!payload) {
      return json({ synced: false, sessionData: null, timestamp: Date.now() });
    }

    return json({
      synced: true,
      sessionData: {
        userId: payload.userId,
        email: payload.email,
        name: payload.name,
        image: payload.image,
        plan: payload.plan,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('[api.auth.sync] GET error:', error);
    return json({ synced: false, sessionData: null, error: 'Sync check failed' }, { status: 500 });
  }
}

// ── action (POST / DELETE) ────────────────────────────────────────────
export async function action({ request }: ActionFunctionArgs) {
  const method = request.method.toUpperCase();

  // ── DELETE — clear sync cookie (logout propagation) ──
  if (method === 'DELETE') {
    return json(
      { success: true, action: 'logout', timestamp: Date.now() },
      {
        headers: {
          'Set-Cookie': buildSetCookie(SYNC_COOKIE_NAME, '', 0),
        },
      },
    );
  }

  // ── POST — receive and set sync token ──
  if (method === 'POST') {
    const syncOrigin = request.headers.get('x-sync-origin');

    if (!syncOrigin) {
      return json({ error: 'Missing sync origin' }, { status: 403 });
    }

    const secret = getSyncSecret();

    if (!secret) {
      logger.error('[api.auth.sync] SESSION_SYNC_SECRET not configured');
      return json({ error: 'Sync secret not configured' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing bearer token' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const payload = await verifyToken(token, secret);

    if (!payload) {
      return json({ error: 'Invalid or expired sync token' }, { status: 401 });
    }

    return json(
      { success: true, synced: true, timestamp: Date.now() },
      {
        headers: {
          'Set-Cookie': buildSetCookie(SYNC_COOKIE_NAME, token, COOKIE_MAX_AGE),
        },
      },
    );
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
