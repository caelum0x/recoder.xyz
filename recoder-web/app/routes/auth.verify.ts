import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const SESSION_COOKIE_NAMES = [
  '__Secure-recoder.session_token',
  'recoder.session_token',
  '__Secure-session_token',
  'session_token',
  'recoder_session_token',
];
const logger = createScopedLogger('auth.verify');

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

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = (context as unknown as { cloudflare?: { env?: Record<string, string> } } | undefined)?.cloudflare?.env;
  const url = new URL(request.url);
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

    const userData = await verifyResponse.json();

    // DO NOT set session cookies here. The cross-subdomain cookie set by
    // recoder.xyz (Domain=.recoder.xyz, SameSite=None) already reaches
    // web.recoder.xyz. Setting a web.recoder.xyz-scoped cookie without
    // the signature suffix would OVERRIDE the correct cookie and break
    // session verification.
    return json({ success: true, user: userData });
  } catch (error) {
    logger.error('Token verification error', error);
    return json({ error: 'Verification failed' }, { status: 500 });
  }
}
