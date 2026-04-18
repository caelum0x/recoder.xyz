import { json, redirect, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { WEB_SESSION_DATA_COOKIE_NAMES } from '~/lib/auth/session.server';
import { createScopedLogger } from '~/utils/logger';

const SESSION_COOKIE_NAMES = [
  '__Secure-recoder.session_token',
  'recoder.session_token',
  '__Secure-session_token',
  'session_token',
  'recoder_session_token',
];
const logger = createScopedLogger('auth.verify');
const WEB_SESSION_BRIDGE_MAX_AGE_SECONDS = 60 * 60 * 12;

function normalizeSessionToken(rawToken: string): string {
  let token = rawToken.trim().replace(/^["']|["']$/g, '');
  if (!token) return '';
  token = token.replace(/^Bearer\s+/i, '').trim();

  for (const cookieName of SESSION_COOKIE_NAMES) {
    const prefix = `${cookieName}=`;
    if (token.startsWith(prefix)) {
      token = token.slice(prefix.length);
      break;
    }
  }

  if (token.includes(';')) {
    token = token.split(';')[0] || token;
  }

  try {
    token = decodeURIComponent(token);
  } catch {
    // keep raw token when not URI-encoded
  }

  return token.trim();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(signature));
}

type VerifiedUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
};

type VerifyTokenResponse =
  | VerifiedUser
  | {
      success?: boolean;
      user?: VerifiedUser | null;
    };

function base64UrlEncode(value: string): string {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function encodeSessionDataCookie(user: VerifiedUser): string {
  return base64UrlEncode(JSON.stringify({ session: { user } }));
}

function buildWebSessionBridgeCookie(requestUrl: URL, user: VerifiedUser): string {
  const secure = requestUrl.protocol === 'https:';
  const cookieName = secure
    ? WEB_SESSION_DATA_COOKIE_NAMES[0]
    : WEB_SESSION_DATA_COOKIE_NAMES[1];
  const value = encodeSessionDataCookie(user);
  const attributes = [
    `${cookieName}=${value}`,
    'Path=/',
    `Max-Age=${WEB_SESSION_BRIDGE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

function getPublicOrigin(
  request: Request,
  requestUrl: URL,
  env?: Record<string, string>,
): string {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    || request.headers.get('host')?.split(',')[0]?.trim();

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const configuredPublicUrl =
    env?.RECODER_WEB_URL
    || process.env.RECODER_WEB_URL
    || process.env.MAIN_SITE_URL;

  if (configuredPublicUrl?.trim()) {
    return configuredPublicUrl.replace(/\/+$/, '');
  }

  return requestUrl.origin;
}

function resolveRedirectTarget(publicOrigin: string, rawTarget: string | null): string | null {
  if (!rawTarget?.trim()) {
    return null;
  }

  try {
    const targetUrl = new URL(rawTarget, publicOrigin);
    if (targetUrl.origin !== publicOrigin) {
      return null;
    }
    return targetUrl.toString();
  } catch {
    return null;
  }
}

function normalizeVerifiedUser(payload: VerifyTokenResponse | null): VerifiedUser | null {
  const candidate = payload && typeof payload === 'object' && 'user' in payload
    ? payload.user
    : payload;

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const user = candidate as Partial<VerifiedUser>;
  if (typeof user.id !== 'string' || typeof user.email !== 'string') {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
    imageUrl: user.imageUrl ?? null,
    subscriptionPlan: user.subscriptionPlan,
    subscriptionStatus: user.subscriptionStatus,
  };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = (context as unknown as { cloudflare?: { env?: Record<string, string> } } | undefined)?.cloudflare?.env;
  const url = new URL(request.url);
  const publicOrigin = getPublicOrigin(request, url, env);
  const authHeader = request.headers.get('Authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const tokenFromQuery = url.searchParams.get('token') || '';
  const tokenFromBearer = bearerMatch?.[1]?.trim() || '';
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieToken = SESSION_COOKIE_NAMES
    .map((name) => {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]+)`));
      return match?.[1] ? decodeURIComponent(match[1]) : '';
    })
    .find((value) => value.length > 0) || '';
  const token = normalizeSessionToken(tokenFromQuery || tokenFromBearer || cookieToken);
  
  if (!token) {
    return json({ error: 'No token provided' }, { status: 401 });
  }

  try {
    const internalServiceKey = env?.INTERNAL_SERVICE_KEY || process.env.INTERNAL_SERVICE_KEY || '';
    if (!internalServiceKey) {
      return json({ error: 'Internal service auth is not configured' }, { status: 500 });
    }

    const verifyPathname = '/api/auth/verify-token';
    const body = JSON.stringify({ token });
    const timestamp = String(Date.now());
    const nonce = crypto.randomUUID();
    const bodyHash = await sha256Hex(body);
    const payload = [timestamp, nonce, 'POST', verifyPathname, bodyHash].join('.');
    const signature = await hmacSha256Hex(internalServiceKey, payload);
    const mainSiteUrl = env?.MAIN_SITE_INTERNAL_URL || process.env.MAIN_SITE_INTERNAL_URL
      || env?.MAIN_SITE_URL || process.env.MAIN_SITE_URL || 'https://recoder.xyz';

    // Verify token with main app
    const verifyResponse = await fetch(`${mainSiteUrl}${verifyPathname}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-service-key': internalServiceKey,
        'x-internal-timestamp': timestamp,
        'x-internal-nonce': nonce,
        'x-internal-signature': signature,
      },
      body,
    });

    if (!verifyResponse.ok) {
      let upstream: Record<string, unknown> = {};
      try { upstream = await verifyResponse.json() as Record<string, unknown>; } catch { /* non-JSON */ }
      logger.error(
        `upstream verify-token failed: HTTP ${verifyResponse.status} url=${mainSiteUrl}${verifyPathname}`,
        upstream,
      );
      return json(
        {
          error: 'Invalid token',
          upstreamStatus: verifyResponse.status,
          upstreamError: upstream.error,
          upstreamReason: upstream.reason,
        },
        { status: 401 },
      );
    }

    const verifyPayload = await verifyResponse.json().catch(() => null) as VerifyTokenResponse | null;
    const userData = normalizeVerifiedUser(verifyPayload);
    if (!userData) {
      logger.error('verify-token returned an unexpected payload', verifyPayload);
      return json({ error: 'Invalid verification payload' }, { status: 502 });
    }

    const cookie = buildWebSessionBridgeCookie(url, userData);
    const redirectTarget = resolveRedirectTarget(publicOrigin, url.searchParams.get('redirect'))
      || new URL('/', publicOrigin).toString();

    return redirect(redirectTarget, {
      headers: {
        'Set-Cookie': cookie,
      },
    });
  } catch (error) {
    logger.error('Token verification error', error);
    return json({ error: 'Verification failed' }, { status: 500 });
  }
}
